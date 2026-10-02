//! Lists the font families installed on this PC through DirectWrite, for the font picker.
//!
//! The command is `async` and does its COM work inside `spawn_blocking`: a plain (sync) Tauri
//! command would run on the main thread, and enumerating a few hundred families is slow enough
//! to be felt there. The blocking thread initialises COM for the duration of the call, the same
//! way `spell.rs` does, and releases every DirectWrite object before uninitialising it.

use serde::Serialize;

use windows::core::{Interface, BOOL};
use windows::Win32::Graphics::DirectWrite::{
    DWriteCreateFactory, IDWriteFactory, IDWriteFont1, IDWriteFontCollection, IDWriteFontFamily,
    IDWriteLocalizedStrings, DWRITE_FACTORY_TYPE_SHARED, DWRITE_FONT_STRETCH_NORMAL,
    DWRITE_FONT_STYLE_NORMAL, DWRITE_FONT_WEIGHT_NORMAL,
};
use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_MULTITHREADED};

/// The Arabic letter alef (U+0627): a family that has it can set Arabic text.
const ARABIC_PROBE: u32 = 0x0627;

/// One installed font family.
#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SystemFont {
    pub family: String,
    pub monospace: bool,
    pub arabic: bool,
}

/// Picks the family name to show from a family's `(locale, name)` pairs: the `en-us` one, else
/// the first. `None` when there are no names.
pub fn choose_name(names: &[(String, String)]) -> Option<String> {
    names
        .iter()
        .find(|(locale, _)| locale.eq_ignore_ascii_case("en-us"))
        .or_else(|| names.first())
        .map(|(_, name)| name.clone())
}

/// Whether a family belongs in the picker. `@Name` families are vertical-writing variants of
/// the same font, and empty names are useless.
pub fn is_listable(name: &str) -> bool {
    let name = name.trim();
    !name.is_empty() && !name.starts_with('@')
}

/// Sorts A to Z (ignoring case) and drops repeated family names, keeping the first of each.
pub fn sort_and_dedup(mut fonts: Vec<SystemFont>) -> Vec<SystemFont> {
    fonts.sort_by(|a, b| {
        a.family
            .to_lowercase()
            .cmp(&b.family.to_lowercase())
            .then_with(|| a.family.cmp(&b.family))
    });
    fonts.dedup_by(|a, b| a.family.eq_ignore_ascii_case(&b.family));
    fonts
}

/// All `(locale, name)` pairs of a localised string set. Entries that fail to read are skipped.
fn read_localized(strings: &IDWriteLocalizedStrings) -> Vec<(String, String)> {
    let count = unsafe { strings.GetCount() };
    let mut out = Vec::new();
    for i in 0..count {
        let locale = unsafe {
            let Ok(len) = strings.GetLocaleNameLength(i) else {
                continue;
            };
            let mut buf = vec![0u16; len as usize + 1];
            if strings.GetLocaleName(i, &mut buf).is_err() {
                continue;
            }
            String::from_utf16_lossy(&buf[..len as usize])
        };
        let name = unsafe {
            let Ok(len) = strings.GetStringLength(i) else {
                continue;
            };
            let mut buf = vec![0u16; len as usize + 1];
            if strings.GetString(i, &mut buf).is_err() {
                continue;
            }
            String::from_utf16_lossy(&buf[..len as usize])
        };
        out.push((locale, name));
    }
    out
}

/// Reads one family, or `None` if it's hidden or can't be read (it's then left out rather than
/// failing the whole list).
fn read_family(family: &IDWriteFontFamily) -> Option<SystemFont> {
    let names = unsafe { family.GetFamilyNames() }.ok()?;
    let name = choose_name(&read_localized(&names))?;
    if !is_listable(&name) {
        return None;
    }
    let regular = unsafe {
        family.GetFirstMatchingFont(
            DWRITE_FONT_WEIGHT_NORMAL,
            DWRITE_FONT_STRETCH_NORMAL,
            DWRITE_FONT_STYLE_NORMAL,
        )
    }
    .ok()?;
    let font1 = regular.cast::<IDWriteFont1>().ok();
    let monospace = font1
        .as_ref()
        .is_some_and(|f| unsafe { f.IsMonospacedFont() }.as_bool());
    let arabic = unsafe { regular.HasCharacter(ARABIC_PROBE) }
        .unwrap_or(BOOL(0))
        .as_bool();
    Some(SystemFont {
        family: name.trim().to_string(),
        monospace,
        arabic,
    })
}

/// Enumerates the system font collection. COM must already be initialised on this thread.
fn enumerate() -> Result<Vec<SystemFont>, String> {
    let factory: IDWriteFactory =
        unsafe { DWriteCreateFactory(DWRITE_FACTORY_TYPE_SHARED) }.map_err(|e| e.to_string())?;
    let mut collection: Option<IDWriteFontCollection> = None;
    unsafe { factory.GetSystemFontCollection(&mut collection, false) }
        .map_err(|e| e.to_string())?;
    let collection = collection.ok_or_else(|| "no system font collection".to_string())?;
    let count = unsafe { collection.GetFontFamilyCount() };
    let mut fonts = Vec::with_capacity(count as usize);
    for i in 0..count {
        let Ok(family) = (unsafe { collection.GetFontFamily(i) }) else {
            continue;
        };
        if let Some(font) = read_family(&family) {
            fonts.push(font);
        }
    }
    Ok(sort_and_dedup(fonts))
}

/// Runs `enumerate` inside its own COM apartment on the calling thread.
fn list_blocking() -> Result<Vec<SystemFont>, String> {
    // SAFETY: paired with the CoUninitialize below, but only when this call initialised COM
    // (S_OK or S_FALSE); a thread already in another apartment mode (RPC_E_CHANGED_MODE) still
    // works for DirectWrite and must not be uninitialised.
    let initialised = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) }.is_ok();
    let result = enumerate();
    if initialised {
        // Every DirectWrite object lives inside `enumerate` and is already released.
        unsafe { CoUninitialize() };
    }
    result
}

/// Every font family installed on this PC, sorted A to Z, with whether it is monospace and
/// whether it covers Arabic.
#[tauri::command]
pub async fn list_system_fonts() -> Result<Vec<SystemFont>, String> {
    tauri::async_runtime::spawn_blocking(list_blocking)
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pair(locale: &str, name: &str) -> (String, String) {
        (locale.to_string(), name.to_string())
    }

    fn font(family: &str) -> SystemFont {
        SystemFont {
            family: family.to_string(),
            monospace: false,
            arabic: false,
        }
    }

    #[test]
    fn prefers_the_en_us_name() {
        let names = [
            pair("ar-sa", "خط"),
            pair("en-US", "Font"),
            pair("fr-fr", "Police"),
        ];
        assert_eq!(choose_name(&names), Some("Font".to_string()));
    }

    #[test]
    fn falls_back_to_the_first_name() {
        let names = [pair("ja-jp", "游ゴシック"), pair("de-de", "Gothic")];
        assert_eq!(choose_name(&names), Some("游ゴシック".to_string()));
        assert_eq!(choose_name(&[]), None);
    }

    #[test]
    fn hides_vertical_variants_and_blanks() {
        assert!(is_listable("Segoe UI"));
        assert!(!is_listable("@MS Gothic"));
        assert!(!is_listable("  "));
        assert!(!is_listable(""));
    }

    #[test]
    fn sorts_ignoring_case_and_removes_duplicates() {
        let sorted = sort_and_dedup(vec![
            font("segoe UI"),
            font("Arial"),
            font("Segoe UI"),
            font("cambria"),
            font("Arial"),
        ]);
        let names: Vec<&str> = sorted.iter().map(|f| f.family.as_str()).collect();
        assert_eq!(names, ["Arial", "cambria", "Segoe UI"]);
    }

    #[test]
    fn serialises_with_camel_case_keys() {
        let json = serde_json::to_string(&SystemFont {
            family: "Consolas".to_string(),
            monospace: true,
            arabic: false,
        })
        .unwrap_or_default();
        assert_eq!(
            json,
            r#"{"family":"Consolas","monospace":true,"arabic":false}"#
        );
    }
}
