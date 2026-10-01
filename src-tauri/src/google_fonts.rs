//! Google Fonts from Fontsource: the catalogue, one-off downloads and the downloaded-font store.
//!
//! All network access for fonts happens here, so the webview's CSP never changes. Exactly two
//! hosts are contacted (`api.fontsource.org` and `cdn.jsdelivr.net`), with URLs built from a
//! validated font id and fixed subsets, weights and styles; there is no "fetch this URL" command.
//!
//! Everything is stored under `<app data>/fonts/` (next to `settings.json`):
//!
//! ```text
//! fonts/catalog.json        cached catalogue (Google fonts only, the fields the picker needs)
//! fonts/manifest.json       the downloaded fonts: { "fonts": [ { id, family, category, files } ] }
//! fonts/<id>/<file>.woff2   one file per subset, style and weight (or weight range)
//! ```
//!
//! A download goes into a temporary folder first and only replaces `fonts/<id>/` and the manifest
//! once every file has arrived and checked out, so a failure never leaves a half-installed font.
//! The commands are `async` and do their I/O inside `spawn_blocking`, like `fonts.rs`.

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Deserializer, Serialize};
use tauri::Manager;

const API_BASE: &str = "https://api.fontsource.org/v1";
const CDN_BASE: &str = "https://cdn.jsdelivr.net/fontsource/fonts";

/// How long a cached catalogue is used without asking the network again.
const CATALOG_MAX_AGE: Duration = Duration::from_secs(7 * 24 * 60 * 60);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(20);
/// Largest font file accepted (the biggest variable Latin/Arabic subsets are a few hundred KB).
const MAX_FONT_BYTES: u64 = 5 * 1024 * 1024;
/// Upper bound for the JSON documents (the full catalogue is about 1.5 MB).
const MAX_JSON_BYTES: u64 = 20 * 1024 * 1024;

/// The alphabets that are downloaded, when the font has them.
const WANTED_SUBSETS: [&str; 3] = ["latin", "latin-ext", "arabic"];

/// Serialises everything that changes the store (install, remove), so two downloads can't
/// overwrite each other's manifest entry.
static STORE_LOCK: Mutex<()> = Mutex::new(());
/// Makes temporary folder names unique within the process.
static TEMP_COUNTER: AtomicU64 = AtomicU64::new(0);

/// One font in the catalogue, with the fields the UI needs.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CatalogFont {
    pub id: String,
    pub family: String,
    pub category: String,
    pub subsets: Vec<String>,
    pub weights: Vec<u32>,
    pub styles: Vec<String>,
    pub variable: bool,
}

/// One downloaded file. `weight` is ready for a `FontFace` descriptor: `"400"` for a static file,
/// `"200 900"` for a variable one. `unicode_range` is empty if Fontsource listed none.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DownloadedFontFile {
    pub file: String,
    pub weight: String,
    pub style: String,
    pub unicode_range: String,
}

/// A font that has been downloaded and is available offline.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DownloadedFont {
    pub id: String,
    pub family: String,
    pub category: String,
    pub files: Vec<DownloadedFontFile>,
}

#[derive(Serialize, Deserialize, Default)]
struct Manifest {
    fonts: Vec<DownloadedFont>,
}

/// A catalogue entry as Fontsource sends it (a superset of `CatalogFont`).
#[derive(Deserialize)]
struct RawCatalogFont {
    id: String,
    family: String,
    #[serde(default)]
    category: String,
    #[serde(default)]
    subsets: Vec<String>,
    #[serde(default)]
    weights: Vec<u32>,
    #[serde(default)]
    styles: Vec<String>,
    #[serde(default, deserialize_with = "lenient_bool")]
    variable: bool,
    #[serde(rename = "type", default)]
    kind: String,
}

/// `variable` is a plain boolean today; also accept an axes object (true) in case Fontsource
/// ever sends one, instead of failing the whole catalogue.
fn lenient_bool<'de, D: Deserializer<'de>>(deserializer: D) -> Result<bool, D::Error> {
    let value = serde_json::Value::deserialize(deserializer)?;
    Ok(match value {
        serde_json::Value::Bool(b) => b,
        serde_json::Value::Object(map) => !map.is_empty(),
        _ => false,
    })
}

/// One font as `/v1/fonts/<id>` describes it. Only what the file selection needs.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FontInfo {
    #[serde(default)]
    subsets: Vec<String>,
    #[serde(default)]
    weights: Vec<u32>,
    #[serde(default)]
    styles: Vec<String>,
    #[serde(default)]
    variable: bool,
    #[serde(default)]
    unicode_range: HashMap<String, String>,
}

/// `/v1/variable/<id>`: the variable font's axes, each with `min` and `max` (strings).
#[derive(Deserialize)]
struct VariableInfo {
    #[serde(default)]
    axes: HashMap<String, VariableAxis>,
}

#[derive(Deserialize)]
struct VariableAxis {
    min: serde_json::Value,
    max: serde_json::Value,
}

/// One file to download, before it exists on disk.
#[derive(Clone, Debug, PartialEq, Eq)]
struct PlannedFile {
    file: String,
    url: String,
    weight: String,
    style: String,
    unicode_range: String,
}

// ---------------------------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------------------------

/// Whether `id` is a Fontsource font id: 1 to 64 characters of `a-z`, `0-9` and `-`.
pub fn is_valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}

/// Whether `file` is a font file name this module writes: a valid id-style stem plus `.woff2`.
/// No separators or dots can appear, so it can't point outside a font's folder.
pub fn is_valid_file_name(file: &str) -> bool {
    file.strip_suffix(".woff2").is_some_and(is_valid_id)
}

/// The file name for one subset/weight/style, the same as on the CDN. `weight` is `"wght"` for a
/// variable file.
fn file_name(subset: &str, weight: &str, style: &str) -> String {
    format!("{subset}-{weight}-{style}.woff2")
}

fn font_info_url(id: &str) -> String {
    format!("{API_BASE}/fonts/{id}")
}

fn variable_info_url(id: &str) -> String {
    format!("{API_BASE}/variable/{id}")
}

fn variable_file_url(id: &str, file: &str) -> String {
    format!("{CDN_BASE}/{id}:vf@latest/{file}")
}

fn static_file_url(id: &str, file: &str) -> String {
    format!("{CDN_BASE}/{id}@latest/{file}")
}

/// The static weights to download: 400 and 700 where the font has them; if it has neither, the
/// one weight closest to 400 (the lighter on a tie). Empty only if the font lists no weights.
fn pick_static_weights(weights: &[u32]) -> Vec<u32> {
    let picked: Vec<u32> = [400, 700]
        .into_iter()
        .filter(|w| weights.contains(w))
        .collect();
    if !picked.is_empty() {
        return picked;
    }
    weights
        .iter()
        .copied()
        .min_by_key(|w| (w.abs_diff(400), *w))
        .into_iter()
        .collect()
}

/// A number from an axis bound, which Fontsource sends as a string (`"200"`).
fn axis_number(value: &serde_json::Value) -> Option<f64> {
    match value {
        serde_json::Value::String(s) => s.trim().parse().ok(),
        serde_json::Value::Number(n) => n.as_f64(),
        _ => None,
    }
}

fn format_number(n: f64) -> String {
    if n.fract() == 0.0 {
        format!("{}", n as i64)
    } else {
        format!("{n}")
    }
}

/// The `wght` range of a variable font as a `FontFace` weight (`"200 900"`), or `None` if it has
/// no usable `wght` axis (then the font is treated as a static one).
fn wght_range(info: &VariableInfo) -> Option<String> {
    let axis = info.axes.get("wght")?;
    let (min, max) = (axis_number(&axis.min)?, axis_number(&axis.max)?);
    if !(min > 0.0 && max >= min) {
        return None;
    }
    Some(format!("{} {}", format_number(min), format_number(max)))
}

/// Chooses the files to download for a font. `wght` is the variable weight range when the font is
/// variable with a `wght` axis. Never plans a file for a subset, style or weight the font doesn't
/// list. Fails (planning nothing) if the font has none of the wanted alphabets.
fn plan_files(id: &str, info: &FontInfo, wght: Option<&str>) -> Result<Vec<PlannedFile>, String> {
    let subsets: Vec<&str> = WANTED_SUBSETS
        .into_iter()
        .filter(|s| info.subsets.iter().any(|have| have == s))
        .collect();
    if subsets.is_empty() {
        return Err("This font has no Latin or Arabic characters.".to_string());
    }
    let styles: Vec<&str> = ["normal", "italic"]
        .into_iter()
        .filter(|s| info.styles.iter().any(|have| have == s))
        .collect();
    if styles.is_empty() {
        return Err("This font lists no normal or italic style.".to_string());
    }
    let static_weights = pick_static_weights(&info.weights);
    if wght.is_none() && static_weights.is_empty() {
        return Err("This font lists no weights.".to_string());
    }

    let mut planned = Vec::new();
    for subset in subsets {
        let unicode_range = info.unicode_range.get(subset).cloned().unwrap_or_default();
        for style in &styles {
            if let Some(range) = wght {
                let file = file_name(subset, "wght", style);
                planned.push(PlannedFile {
                    url: variable_file_url(id, &file),
                    file,
                    weight: range.to_string(),
                    style: style.to_string(),
                    unicode_range: unicode_range.clone(),
                });
            } else {
                for weight in &static_weights {
                    let file = file_name(subset, &weight.to_string(), style);
                    planned.push(PlannedFile {
                        url: static_file_url(id, &file),
                        file,
                        weight: weight.to_string(),
                        style: style.to_string(),
                        unicode_range: unicode_range.clone(),
                    });
                }
            }
        }
    }
    Ok(planned)
}

/// Checks a downloaded file looks like a WOFF2 font and isn't too big.
fn validate_font_bytes(bytes: &[u8]) -> Result<(), String> {
    if bytes.len() as u64 > MAX_FONT_BYTES {
        return Err("A font file was larger than expected.".to_string());
    }
    if !bytes.starts_with(b"wOF2") {
        return Err("A downloaded file was not a valid font.".to_string());
    }
    Ok(())
}

/// Keeps the Google fonts of a raw catalogue, with only the fields the UI needs.
fn filter_catalog(raw: Vec<RawCatalogFont>) -> Vec<CatalogFont> {
    raw.into_iter()
        .filter(|f| f.kind == "google" && is_valid_id(&f.id))
        .map(|f| CatalogFont {
            id: f.id,
            family: f.family,
            category: f.category,
            subsets: f.subsets,
            weights: f.weights,
            styles: f.styles,
            variable: f.variable,
        })
        .collect()
}

/// Whether a cache of this age is still used without refreshing.
fn cache_is_fresh(age: Duration) -> bool {
    age < CATALOG_MAX_AGE
}

// ---------------------------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------------------------

/// Writes `bytes` to `path` through a temporary sibling file and a rename, so a reader never sees
/// a half-written file.
fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let mut temp_name = path
        .file_name()
        .map(|n| n.to_os_string())
        .unwrap_or_default();
    temp_name.push(".tmp");
    let temp = path.with_file_name(temp_name);
    if let Err(e) = fs::write(&temp, bytes) {
        let _ = fs::remove_file(&temp);
        return Err(e.to_string());
    }
    fs::rename(&temp, path).map_err(|e| {
        let _ = fs::remove_file(&temp);
        e.to_string()
    })
}

fn remove_dir_if_exists(dir: &Path) -> Result<(), String> {
    match fs::remove_dir_all(dir) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// The manifest's fonts. A missing or unreadable-as-JSON manifest counts as empty (a damaged one
/// is replaced by the next install), other I/O errors are reported.
fn read_manifest(fonts: &Path) -> Result<Vec<DownloadedFont>, String> {
    match fs::read(fonts.join("manifest.json")) {
        Ok(bytes) => Ok(serde_json::from_slice::<Manifest>(&bytes)
            .map(|m| m.fonts)
            .unwrap_or_default()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
        Err(e) => Err(e.to_string()),
    }
}

fn write_manifest(fonts: &Path, list: &[DownloadedFont]) -> Result<(), String> {
    let manifest = Manifest {
        fonts: list.to_vec(),
    };
    let json = serde_json::to_vec_pretty(&manifest).map_err(|e| e.to_string())?;
    write_atomic(&fonts.join("manifest.json"), &json)
}

/// Replaces the entry with the same id, or appends. Kept sorted by family for a stable list.
fn upsert(list: &mut Vec<DownloadedFont>, font: DownloadedFont) {
    list.retain(|f| f.id != font.id);
    list.push(font);
    list.sort_by_key(|f| f.family.to_lowercase());
}

/// The cached catalogue and how old it is, if there is a readable one.
fn read_catalog_cache(fonts: &Path) -> Option<(Vec<CatalogFont>, Duration)> {
    let path = fonts.join("catalog.json");
    let bytes = fs::read(&path).ok()?;
    let list: Vec<CatalogFont> = serde_json::from_slice(&bytes).ok()?;
    if list.is_empty() {
        return None;
    }
    // An unreadable modified time or a clock set back counts as very old.
    let age = fs::metadata(&path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| SystemTime::now().duration_since(t).ok())
        .unwrap_or(CATALOG_MAX_AGE);
    Some((list, age))
}

/// The catalogue: the cache if it is fresh (and `refresh` is false), else `fetch`ed and cached.
/// If fetching fails, a cache of any age is used; with no cache the fetch error is returned.
fn load_catalog(
    fonts: &Path,
    refresh: bool,
    fetch: impl FnOnce() -> Result<Vec<CatalogFont>, String>,
) -> Result<Vec<CatalogFont>, String> {
    let cached = read_catalog_cache(fonts);
    if let Some((list, age)) = &cached {
        if !refresh && cache_is_fresh(*age) {
            return Ok(list.clone());
        }
    }
    let fetched = fetch().and_then(|list| {
        if list.is_empty() {
            Err("The font catalogue came back empty.".to_string())
        } else {
            Ok(list)
        }
    });
    match fetched {
        Ok(list) => {
            // Failing to cache only means asking again next time; the list itself is fine.
            let _ = fs::create_dir_all(fonts)
                .map_err(|e| e.to_string())
                .and_then(|()| {
                    let json = serde_json::to_vec(&list).map_err(|e| e.to_string())?;
                    write_atomic(&fonts.join("catalog.json"), &json)
                });
            Ok(list)
        }
        Err(e) => match cached {
            Some((list, _)) => Ok(list),
            None => Err(e),
        },
    }
}

fn temp_dir_name(id: &str) -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or_default();
    let n = TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!(".tmp-{id}-{nanos}-{n}")
}

/// Downloads every planned file into `dir` (created here). Any failure stops at once; the caller
/// removes `dir`.
fn stage_files(
    dir: &Path,
    files: &[PlannedFile],
    fetch: &dyn Fn(&str) -> Result<Vec<u8>, String>,
) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    for file in files {
        let bytes = fetch(&file.url)?;
        validate_font_bytes(&bytes)?;
        fs::write(dir.join(&file.file), &bytes).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Moves a fully staged folder into place as `fonts/<id>/` and records the font in the manifest.
/// If anything fails the previous version (if any) is put back.
fn commit_install(fonts: &Path, staged: &Path, font: DownloadedFont) -> Result<(), String> {
    let _guard = STORE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let mut list = read_manifest(fonts)?;
    let target = fonts.join(&font.id);
    let backup = fonts.join(format!(".old-{}", font.id));
    remove_dir_if_exists(&backup)?;
    let had_previous = target.exists();
    if had_previous {
        fs::rename(&target, &backup).map_err(|e| e.to_string())?;
    }
    let restore = |target: &Path, backup: &Path| {
        if had_previous {
            let _ = fs::rename(backup, target);
        }
    };
    if let Err(e) = fs::rename(staged, &target) {
        restore(&target, &backup);
        return Err(e.to_string());
    }
    upsert(&mut list, font);
    if let Err(e) = write_manifest(fonts, &list) {
        let _ = fs::remove_dir_all(&target);
        restore(&target, &backup);
        return Err(e);
    }
    // A leftover backup is harmless and removed by the next install of this font.
    let _ = fs::remove_dir_all(&backup);
    Ok(())
}

/// Installs a font from its plan: stages every file in a temporary folder, then commits. Nothing
/// is left behind on failure.
fn install_font(
    fonts: &Path,
    entry: &CatalogFont,
    files: &[PlannedFile],
    fetch: &dyn Fn(&str) -> Result<Vec<u8>, String>,
) -> Result<DownloadedFont, String> {
    fs::create_dir_all(fonts).map_err(|e| e.to_string())?;
    let staged = fonts.join(temp_dir_name(&entry.id));
    let font = DownloadedFont {
        id: entry.id.clone(),
        family: entry.family.clone(),
        category: entry.category.clone(),
        files: files
            .iter()
            .map(|f| DownloadedFontFile {
                file: f.file.clone(),
                weight: f.weight.clone(),
                style: f.style.clone(),
                unicode_range: f.unicode_range.clone(),
            })
            .collect(),
    };
    let result = stage_files(&staged, files, fetch)
        .and_then(|()| commit_install(fonts, &staged, font.clone()));
    if result.is_err() {
        let _ = fs::remove_dir_all(&staged);
    }
    result.map(|()| font)
}

/// Removes a font's folder and its manifest entry (the entry first, so a folder that can't be
/// deleted never leaves a listed font without files).
fn remove_font(fonts: &Path, id: &str) -> Result<(), String> {
    let _guard = STORE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let mut list = read_manifest(fonts)?;
    let before = list.len();
    list.retain(|f| f.id != id);
    if list.len() != before {
        write_manifest(fonts, &list)?;
    }
    remove_dir_if_exists(&fonts.join(id))
}

/// The bytes of one downloaded file, after checking both names.
fn read_font_bytes(fonts: &Path, id: &str, file: &str) -> Result<Vec<u8>, String> {
    if !is_valid_id(id) {
        return Err("Invalid font id.".to_string());
    }
    if !is_valid_file_name(file) {
        return Err("Invalid font file name.".to_string());
    }
    fs::read(fonts.join(id).join(file)).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------------------------

fn agent() -> ureq::Agent {
    ureq::Agent::config_builder()
        .timeout_global(Some(REQUEST_TIMEOUT))
        .user_agent(format!("MarkdownViewer/{}", env!("CARGO_PKG_VERSION")))
        // Both hosts answer directly; refusing redirects keeps requests on those two hosts.
        .max_redirects(0)
        .build()
        .into()
}

/// A message the UI can show for a failed request.
fn describe(error: ureq::Error) -> String {
    match error {
        ureq::Error::StatusCode(code) => {
            format!("The font server returned an error (HTTP {code}).")
        }
        ureq::Error::Timeout(_) => "The font server took too long to answer.".to_string(),
        ureq::Error::HostNotFound | ureq::Error::ConnectionFailed | ureq::Error::Io(_) => {
            "Couldn't reach the font server. Check your internet connection.".to_string()
        }
        other => format!("The font request failed: {other}"),
    }
}

/// GETs `url`, requiring a 200 response.
fn get(url: &str) -> Result<ureq::http::Response<ureq::Body>, ureq::Error> {
    let response = agent().get(url).call()?;
    let status = response.status().as_u16();
    if status == 200 {
        Ok(response)
    } else {
        Err(ureq::Error::StatusCode(status))
    }
}

fn get_json<T: serde::de::DeserializeOwned>(url: &str) -> Result<T, String> {
    let mut response = get(url).map_err(describe)?;
    response
        .body_mut()
        .with_config()
        .limit(MAX_JSON_BYTES)
        .read_json::<T>()
        .map_err(describe)
}

fn get_font_bytes(url: &str) -> Result<Vec<u8>, String> {
    let mut response = get(url).map_err(describe)?;
    response
        .body_mut()
        .with_config()
        .limit(MAX_FONT_BYTES)
        .read_to_vec()
        .map_err(|e| match e {
            ureq::Error::BodyExceedsLimit(_) => "A font file was larger than expected.".to_string(),
            other => describe(other),
        })
}

fn fetch_catalog() -> Result<Vec<CatalogFont>, String> {
    get_json::<Vec<RawCatalogFont>>(&format!("{API_BASE}/fonts")).map(filter_catalog)
}

/// The `wght` range of a variable font, `None` if it has no `wght` axis or Fontsource has no axes
/// document for it (404); other failures are reported.
fn fetch_wght_range(id: &str) -> Result<Option<String>, String> {
    match get(&variable_info_url(id)) {
        Ok(mut response) => response
            .body_mut()
            .with_config()
            .limit(MAX_JSON_BYTES)
            .read_json::<VariableInfo>()
            .map(|info| wght_range(&info))
            .map_err(describe),
        Err(ureq::Error::StatusCode(404)) => Ok(None),
        Err(e) => Err(describe(e)),
    }
}

// ---------------------------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------------------------

/// `<app data>/fonts`, the same base folder as `settings.json`.
fn fonts_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join("fonts"))
        .map_err(|e| e.to_string())
}

fn download_blocking(fonts: &Path, id: &str) -> Result<DownloadedFont, String> {
    if !is_valid_id(id) {
        return Err("Invalid font id.".to_string());
    }
    let catalog = load_catalog(fonts, false, fetch_catalog)?;
    let entry = catalog
        .iter()
        .find(|f| f.id == id)
        .ok_or_else(|| "This font isn't in the Google Fonts catalogue.".to_string())?;
    let info: FontInfo = get_json(&font_info_url(id))?;
    let wght = if info.variable {
        fetch_wght_range(id)?
    } else {
        None
    };
    let planned = plan_files(id, &info, wght.as_deref())?;
    install_font(fonts, entry, &planned, &get_font_bytes)
}

/// The Google Fonts catalogue (Google-sourced fonts only): the cached copy if under 7 days old
/// and `refresh` is false, else downloaded from Fontsource and cached. Offline, an older cache is
/// used; with no cache at all the error says so.
#[tauri::command]
pub async fn google_font_catalog(
    app: tauri::AppHandle,
    refresh: bool,
) -> Result<Vec<CatalogFont>, String> {
    let fonts = fonts_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || load_catalog(&fonts, refresh, fetch_catalog))
        .await
        .map_err(|e| e.to_string())?
}

/// Downloads a Google font (the Latin, Latin Extended and Arabic alphabets it has) into the app's
/// data folder. Nothing is kept if any file fails.
#[tauri::command]
pub async fn download_google_font(
    app: tauri::AppHandle,
    id: String,
) -> Result<DownloadedFont, String> {
    let fonts = fonts_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || download_blocking(&fonts, &id))
        .await
        .map_err(|e| e.to_string())?
}

/// The fonts downloaded so far, from the manifest.
#[tauri::command]
pub async fn list_downloaded_fonts(app: tauri::AppHandle) -> Result<Vec<DownloadedFont>, String> {
    let fonts = fonts_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || read_manifest(&fonts))
        .await
        .map_err(|e| e.to_string())?
}

/// The raw bytes of one downloaded font file (sent as binary, not a JSON number array).
#[tauri::command]
pub async fn read_font_file(
    app: tauri::AppHandle,
    id: String,
    file: String,
) -> Result<tauri::ipc::Response, String> {
    let fonts = fonts_dir(&app)?;
    let bytes = tauri::async_runtime::spawn_blocking(move || read_font_bytes(&fonts, &id, &file))
        .await
        .map_err(|e| e.to_string())??;
    Ok(tauri::ipc::Response::new(bytes))
}

/// Deletes a downloaded font and its files.
#[tauri::command]
pub async fn remove_downloaded_font(app: tauri::AppHandle, id: String) -> Result<(), String> {
    if !is_valid_id(&id) {
        return Err("Invalid font id.".to_string());
    }
    let fonts = fonts_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || remove_font(&fonts, &id))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn unique_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "mdv-google-fonts-{name}-{}-{}",
            std::process::id(),
            TEMP_COUNTER.fetch_add(1, Ordering::Relaxed)
        ));
        let _ = fs::remove_dir_all(&dir);
        dir
    }

    fn strings(items: &[&str]) -> Vec<String> {
        items.iter().map(|s| s.to_string()).collect()
    }

    fn info(subsets: &[&str], weights: &[u32], styles: &[&str], variable: bool) -> FontInfo {
        FontInfo {
            subsets: strings(subsets),
            weights: weights.to_vec(),
            styles: strings(styles),
            variable,
            unicode_range: HashMap::from([
                ("latin".to_string(), "U+0000-00FF".to_string()),
                ("arabic".to_string(), "U+0600-06FF".to_string()),
            ]),
        }
    }

    fn catalog_font(id: &str) -> CatalogFont {
        CatalogFont {
            id: id.to_string(),
            family: "Some Font".to_string(),
            category: "serif".to_string(),
            subsets: strings(&["latin"]),
            weights: vec![400],
            styles: strings(&["normal"]),
            variable: false,
        }
    }

    fn planned(id: &str, names: &[&str]) -> Vec<PlannedFile> {
        names
            .iter()
            .map(|n| PlannedFile {
                file: n.to_string(),
                url: static_file_url(id, n),
                weight: "400".to_string(),
                style: "normal".to_string(),
                unicode_range: String::new(),
            })
            .collect()
    }

    fn fake_font(_: &str) -> Result<Vec<u8>, String> {
        Ok(b"wOF2-test-bytes".to_vec())
    }

    #[test]
    fn accepts_only_fontsource_ids() {
        assert!(is_valid_id("literata"));
        assert!(is_valid_id("noto-sans-arabic"));
        assert!(is_valid_id("42dot-sans"));
        assert!(is_valid_id(&"a".repeat(64)));
        assert!(!is_valid_id(""));
        assert!(!is_valid_id(&"a".repeat(65)));
        assert!(!is_valid_id("Literata"));
        assert!(!is_valid_id("../etc"));
        assert!(!is_valid_id("a/b"));
        assert!(!is_valid_id("a\\b"));
        assert!(!is_valid_id("a.b"));
        assert!(!is_valid_id("a b"));
        assert!(!is_valid_id("é"));
    }

    #[test]
    fn accepts_only_plain_woff2_file_names() {
        assert!(is_valid_file_name("latin-wght-normal.woff2"));
        assert!(is_valid_file_name("latin-ext-400-italic.woff2"));
        assert!(!is_valid_file_name("latin-wght-normal.woff"));
        assert!(!is_valid_file_name(".woff2"));
        assert!(!is_valid_file_name("../latin.woff2"));
        assert!(!is_valid_file_name("sub/latin.woff2"));
        assert!(!is_valid_file_name("sub\\latin.woff2"));
        assert!(!is_valid_file_name("latin.woff2.exe"));
        assert!(!is_valid_file_name("manifest.json"));
    }

    #[test]
    fn builds_urls_on_the_two_known_hosts() {
        assert_eq!(
            font_info_url("literata"),
            "https://api.fontsource.org/v1/fonts/literata"
        );
        assert_eq!(
            variable_info_url("literata"),
            "https://api.fontsource.org/v1/variable/literata"
        );
        assert_eq!(
            variable_file_url("literata", "latin-wght-italic.woff2"),
            "https://cdn.jsdelivr.net/fontsource/fonts/literata:vf@latest/latin-wght-italic.woff2"
        );
        assert_eq!(
            static_file_url("lobster", "latin-400-normal.woff2"),
            "https://cdn.jsdelivr.net/fontsource/fonts/lobster@latest/latin-400-normal.woff2"
        );
    }

    #[test]
    fn picks_400_and_700_or_the_closest_weight() {
        assert_eq!(pick_static_weights(&[100, 300, 400, 700, 900]), [400, 700]);
        assert_eq!(pick_static_weights(&[400]), [400]);
        assert_eq!(pick_static_weights(&[300, 500, 700]), [700]);
        assert_eq!(pick_static_weights(&[300, 500]), [300]);
        assert_eq!(pick_static_weights(&[800]), [800]);
        assert_eq!(pick_static_weights(&[200, 600, 900]), [200]);
        assert!(pick_static_weights(&[]).is_empty());
    }

    #[test]
    fn reads_the_wght_range_from_the_axes() {
        let with = |json: &str| wght_range(&serde_json::from_str::<VariableInfo>(json).unwrap());
        assert_eq!(
            with(r#"{"axes":{"opsz":{"min":"7","max":"72"},"wght":{"min":"200","max":"900"}}}"#),
            Some("200 900".to_string())
        );
        assert_eq!(
            with(r#"{"axes":{"wght":{"min":100,"max":1000.5}}}"#),
            Some("100 1000.5".to_string())
        );
        assert_eq!(with(r#"{"axes":{"MORF":{"min":"0","max":"60"}}}"#), None);
        assert_eq!(with(r#"{"axes":{"wght":{"min":"x","max":"900"}}}"#), None);
        assert_eq!(with(r#"{"axes":{"wght":{"min":"900","max":"200"}}}"#), None);
        assert_eq!(with(r#"{}"#), None);
    }

    #[test]
    fn plans_variable_files_for_each_subset_and_style() {
        let i = info(
            &["cyrillic", "latin", "latin-ext", "vietnamese"],
            &[200, 400, 900],
            &["italic", "normal"],
            true,
        );
        let files = plan_files("literata", &i, Some("200 900")).unwrap();
        let names: Vec<&str> = files.iter().map(|f| f.file.as_str()).collect();
        assert_eq!(
            names,
            [
                "latin-wght-normal.woff2",
                "latin-wght-italic.woff2",
                "latin-ext-wght-normal.woff2",
                "latin-ext-wght-italic.woff2"
            ]
        );
        assert_eq!(files[0].weight, "200 900");
        assert_eq!(files[0].unicode_range, "U+0000-00FF");
        assert_eq!(files[2].unicode_range, "");
        assert_eq!(
            files[1].url,
            "https://cdn.jsdelivr.net/fontsource/fonts/literata:vf@latest/latin-wght-italic.woff2"
        );
    }

    #[test]
    fn plans_static_files_only_for_listed_weights_and_styles() {
        let i = info(&["arabic", "latin"], &[300, 400, 700], &["normal"], false);
        let files = plan_files("amiri", &i, None).unwrap();
        let names: Vec<&str> = files.iter().map(|f| f.file.as_str()).collect();
        assert_eq!(
            names,
            [
                "latin-400-normal.woff2",
                "latin-700-normal.woff2",
                "arabic-400-normal.woff2",
                "arabic-700-normal.woff2"
            ]
        );
        assert_eq!(files[1].weight, "700");
        assert_eq!(files[2].unicode_range, "U+0600-06FF");
        assert!(files.iter().all(|f| !f.file.contains("italic")));
        assert!(files.iter().all(|f| f.url.contains("amiri@latest/")));
    }

    #[test]
    fn plans_a_single_closest_weight_when_there_is_no_400_or_700() {
        let i = info(&["latin"], &[300, 500], &["normal"], false);
        let files = plan_files("sunflower", &i, None).unwrap();
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].file, "latin-300-normal.woff2");
        assert_eq!(files[0].weight, "300");
    }

    #[test]
    fn refuses_a_font_without_latin_or_arabic() {
        let i = info(&["khmer"], &[400], &["normal"], false);
        let error = plan_files("chenla", &i, None).unwrap_err();
        assert_eq!(error, "This font has no Latin or Arabic characters.");
    }

    #[test]
    fn refuses_fonts_that_list_no_usable_style_or_weight() {
        assert!(plan_files("x", &info(&["latin"], &[400], &["oblique"], false), None).is_err());
        assert!(plan_files("x", &info(&["latin"], &[], &["normal"], false), None).is_err());
        assert!(plan_files("x", &info(&["latin"], &[], &["normal"], true), Some("1 2")).is_ok());
    }

    #[test]
    fn checks_downloaded_bytes() {
        assert!(validate_font_bytes(b"wOF2....").is_ok());
        assert!(validate_font_bytes(b"<html>").is_err());
        assert!(validate_font_bytes(b"").is_err());
        let mut big = b"wOF2".to_vec();
        big.resize(MAX_FONT_BYTES as usize + 1, 0);
        assert!(validate_font_bytes(&big).is_err());
    }

    #[test]
    fn keeps_only_google_fonts_and_the_needed_fields() {
        let raw: Vec<RawCatalogFont> = serde_json::from_str(
            r#"[
                {"id":"literata","family":"Literata","subsets":["latin"],"weights":[400,700],
                 "styles":["normal","italic"],"defSubset":"latin","variable":true,
                 "category":"serif","license":"OFL-1.1","type":"google"},
                {"id":"some-icons","family":"Icons","type":"icons","variable":false},
                {"id":"BAD ID","family":"Bad","type":"google"},
                {"id":"axes","family":"Axes","type":"google","variable":{"wght":{}}}
            ]"#,
        )
        .unwrap();
        let list = filter_catalog(raw);
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].id, "literata");
        assert!(list[0].variable);
        assert_eq!(list[0].weights, [400, 700]);
        assert!(list[1].variable);
    }

    #[test]
    fn serialises_with_camel_case_keys() {
        let font = DownloadedFont {
            id: "literata".to_string(),
            family: "Literata".to_string(),
            category: "serif".to_string(),
            files: vec![DownloadedFontFile {
                file: "latin-wght-normal.woff2".to_string(),
                weight: "200 900".to_string(),
                style: "normal".to_string(),
                unicode_range: "U+0000-00FF".to_string(),
            }],
        };
        let json = serde_json::to_string(&font).unwrap_or_default();
        assert_eq!(
            json,
            r#"{"id":"literata","family":"Literata","category":"serif","files":[{"file":"latin-wght-normal.woff2","weight":"200 900","style":"normal","unicodeRange":"U+0000-00FF"}]}"#
        );
    }

    #[test]
    fn caches_the_catalogue_and_reuses_it_while_fresh() {
        let dir = unique_dir("catalog-fresh");
        let first = load_catalog(&dir, false, || Ok(vec![catalog_font("a")])).unwrap();
        assert_eq!(first.len(), 1);
        // A fresh cache is used without fetching.
        let second = load_catalog(&dir, false, || Err("must not fetch".to_string())).unwrap();
        assert_eq!(second, first);
        // refresh asks again.
        let third = load_catalog(&dir, true, || {
            Ok(vec![catalog_font("a"), catalog_font("b")])
        })
        .unwrap();
        assert_eq!(third.len(), 2);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn falls_back_to_the_cache_offline_and_errors_without_one() {
        let dir = unique_dir("catalog-offline");
        let offline = || Err::<Vec<CatalogFont>, String>("offline".to_string());
        assert_eq!(load_catalog(&dir, false, offline).unwrap_err(), "offline");
        load_catalog(&dir, false, || Ok(vec![catalog_font("a")])).unwrap();
        let used = load_catalog(&dir, true, offline).unwrap();
        assert_eq!(used.len(), 1);
        let empty = load_catalog(&dir, true, || Ok(Vec::new())).unwrap();
        assert_eq!(empty.len(), 1);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_catalogue_cache_expires_after_seven_days() {
        assert!(cache_is_fresh(Duration::from_secs(60)));
        assert!(cache_is_fresh(Duration::from_secs(6 * 24 * 60 * 60)));
        assert!(!cache_is_fresh(Duration::from_secs(7 * 24 * 60 * 60)));
    }

    #[test]
    fn installs_a_font_and_lists_it() {
        let dir = unique_dir("install");
        let entry = catalog_font("lobster");
        let files = planned(
            "lobster",
            &["latin-400-normal.woff2", "latin-ext-400-normal.woff2"],
        );
        let font = install_font(&dir, &entry, &files, &fake_font).unwrap();
        assert_eq!(font.files.len(), 2);
        assert_eq!(
            fs::read(dir.join("lobster").join("latin-400-normal.woff2")).unwrap(),
            b"wOF2-test-bytes"
        );
        assert_eq!(read_manifest(&dir).unwrap(), vec![font]);
        // Only the final folder and the manifest remain, no temporary leftovers.
        let mut names: Vec<String> = fs::read_dir(&dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().to_string())
            .collect();
        names.sort();
        assert_eq!(names, ["lobster", "manifest.json"]);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_failed_download_leaves_nothing_behind() {
        let dir = unique_dir("failed");
        let entry = catalog_font("lobster");
        let files = planned(
            "lobster",
            &["latin-400-normal.woff2", "latin-ext-400-normal.woff2"],
        );
        let calls = std::cell::Cell::new(0);
        let flaky = |_: &str| {
            calls.set(calls.get() + 1);
            if calls.get() == 2 {
                Err("Couldn't reach the font server.".to_string())
            } else {
                fake_font("")
            }
        };
        let error = install_font(&dir, &entry, &files, &flaky).unwrap_err();
        assert_eq!(error, "Couldn't reach the font server.");
        assert!(read_manifest(&dir).unwrap().is_empty());
        assert!(!dir.join("lobster").exists());
        let left: Vec<_> = fs::read_dir(&dir).unwrap().collect();
        assert!(left.is_empty());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_bad_file_fails_the_install_and_keeps_the_previous_version() {
        let dir = unique_dir("bad-file");
        let entry = catalog_font("lobster");
        let files = planned("lobster", &["latin-400-normal.woff2"]);
        install_font(&dir, &entry, &files, &fake_font).unwrap();
        let html = |_: &str| Ok(b"<html>not a font</html>".to_vec());
        assert!(install_font(&dir, &entry, &files, &html).is_err());
        assert_eq!(
            fs::read(dir.join("lobster").join("latin-400-normal.woff2")).unwrap(),
            b"wOF2-test-bytes"
        );
        assert_eq!(read_manifest(&dir).unwrap().len(), 1);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn reinstalling_replaces_the_entry_and_files() {
        let dir = unique_dir("reinstall");
        let entry = catalog_font("lobster");
        install_font(
            &dir,
            &entry,
            &planned("lobster", &["latin-400-normal.woff2"]),
            &fake_font,
        )
        .unwrap();
        let newer = |_: &str| Ok(b"wOF2-newer".to_vec());
        let files = planned("lobster", &["latin-700-normal.woff2"]);
        install_font(&dir, &entry, &files, &newer).unwrap();
        assert!(!dir.join("lobster").join("latin-400-normal.woff2").exists());
        assert!(dir.join("lobster").join("latin-700-normal.woff2").exists());
        let list = read_manifest(&dir).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].files[0].file, "latin-700-normal.woff2");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn removes_a_font_and_its_manifest_entry() {
        let dir = unique_dir("remove");
        let files = planned("lobster", &["latin-400-normal.woff2"]);
        install_font(&dir, &catalog_font("lobster"), &files, &fake_font).unwrap();
        install_font(&dir, &catalog_font("amiri"), &files, &fake_font).unwrap();
        remove_font(&dir, "lobster").unwrap();
        assert!(!dir.join("lobster").exists());
        let list = read_manifest(&dir).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, "amiri");
        // Removing something that isn't there is fine.
        remove_font(&dir, "lobster").unwrap();
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn reads_font_bytes_only_from_inside_the_font_folder() {
        let dir = unique_dir("read");
        let files = planned("lobster", &["latin-400-normal.woff2"]);
        install_font(&dir, &catalog_font("lobster"), &files, &fake_font).unwrap();
        assert_eq!(
            read_font_bytes(&dir, "lobster", "latin-400-normal.woff2").unwrap(),
            b"wOF2-test-bytes"
        );
        assert!(read_font_bytes(&dir, "lobster", "missing.woff2").is_err());
        assert!(read_font_bytes(&dir, "lobster", "../manifest.json").is_err());
        assert!(read_font_bytes(&dir, "lobster", "..\\manifest.json").is_err());
        assert!(read_font_bytes(&dir, "lobster", "manifest.json").is_err());
        assert!(read_font_bytes(&dir, "..", "latin-400-normal.woff2").is_err());
        assert!(read_font_bytes(&dir, "../lobster", "latin-400-normal.woff2").is_err());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_missing_or_damaged_manifest_reads_as_empty() {
        let dir = unique_dir("manifest");
        fs::create_dir_all(&dir).unwrap();
        assert!(read_manifest(&dir).unwrap().is_empty());
        fs::write(dir.join("manifest.json"), b"{ not json").unwrap();
        assert!(read_manifest(&dir).unwrap().is_empty());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn manifest_entries_are_sorted_by_family_without_duplicates() {
        let make = |id: &str, family: &str| DownloadedFont {
            id: id.to_string(),
            family: family.to_string(),
            category: String::new(),
            files: Vec::new(),
        };
        let mut list = Vec::new();
        upsert(&mut list, make("b", "banana"));
        upsert(&mut list, make("a", "Apple"));
        upsert(&mut list, make("b", "Banana"));
        let ids: Vec<&str> = list.iter().map(|f| f.id.as_str()).collect();
        assert_eq!(ids, ["a", "b"]);
        assert_eq!(list[1].family, "Banana");
    }
}
