use serde::Serialize;
use std::path::PathBuf;
use std::time::UNIX_EPOCH;
use tauri::{AppHandle, Manager};

/// Returns the file path passed on the command line, if any.
/// Set when the app is launched via a `.md` file association or "Open With".
#[tauri::command]
pub fn get_launch_args() -> Option<String> {
    std::env::args()
        .skip(1)
        .find(|a| !a.starts_with('-'))
        .map(|a| {
            // Normalise redundant separators (e.g. doubled backslashes from shell quoting).
            let normalised: PathBuf = PathBuf::from(&a).components().collect();
            normalised.to_string_lossy().into_owned()
        })
}

#[derive(Serialize)]
pub struct FileData {
    content: String,
    /// Modification time in milliseconds since the Unix epoch.
    mtime: u64,
}

fn mtime_ms(path: &PathBuf) -> Result<u64, String> {
    let meta = std::fs::metadata(path).map_err(|e| e.to_string())?;
    let modified = meta.modified().map_err(|e| e.to_string())?;
    Ok(modified
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0))
}

#[tauri::command]
pub fn read_file(path: String) -> Result<FileData, String> {
    let p = PathBuf::from(&path);
    let bytes = std::fs::read(&p).map_err(|e| e.to_string())?;
    // Tolerate non-UTF-8 files rather than failing outright.
    let content = String::from_utf8_lossy(&bytes).into_owned();
    Ok(FileData {
        content,
        mtime: mtime_ms(&p)?,
    })
}

#[tauri::command]
pub fn write_file(path: String, content: String) -> Result<u64, String> {
    let p = PathBuf::from(&path);
    std::fs::write(&p, content).map_err(|e| e.to_string())?;
    mtime_ms(&p)
}

/// Allow the asset protocol to serve files under `dir`, so relative images
/// referenced by the open document can be displayed.
#[tauri::command]
pub fn allow_asset_dir(app: AppHandle, dir: String) -> Result<(), String> {
    app.asset_protocol_scope()
        .allow_directory(PathBuf::from(dir), true)
        .map_err(|e| e.to_string())
}
