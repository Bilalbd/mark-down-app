use serde::Serialize;
use std::io::Write;
use std::path::{Path, PathBuf};
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
    write_atomic(&p, content.as_bytes()).map_err(|e| e.to_string())?;
    mtime_ms(&p)
}

/// Writes `bytes` to `path` via a temp file + rename, so a crash or power loss mid-write
/// can never leave `path` truncated or half-written.
fn write_atomic(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let dir = path.parent().unwrap_or_else(|| Path::new("."));
    let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("file");
    let nanos = std::time::SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let tmp_path = dir.join(format!(".{file_name}.mdv-{}-{nanos}.tmp", std::process::id()));

    let write_result = std::fs::File::create(&tmp_path).and_then(|mut f| {
        f.write_all(bytes)?;
        f.sync_all()
    });
    if let Err(e) = write_result {
        if !tmp_path.exists() {
            // The temp file itself couldn't be created (e.g. read-only directory) - a
            // plain write is no less safe than what we had before this fix.
            return std::fs::write(path, bytes);
        }
        let _ = std::fs::remove_file(&tmp_path);
        return Err(e);
    }

    if let Ok(meta) = std::fs::metadata(path) {
        let _ = std::fs::set_permissions(&tmp_path, meta.permissions());
    }

    match std::fs::rename(&tmp_path, path) {
        Ok(()) => Ok(()),
        Err(e) => {
            let _ = std::fs::remove_file(&tmp_path);
            Err(e)
        }
    }
}

#[cfg(test)]
mod write_atomic_tests {
    use super::*;
    use std::io::Read;

    fn unique_path(name: &str) -> PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!(
            "mdv-test-{}-{}-{}",
            std::process::id(),
            nanos,
            name
        ))
    }

    fn no_tmp_files_left(path: &Path) -> bool {
        let dir = path.parent().unwrap();
        let file_name = path.file_name().unwrap().to_string_lossy().into_owned();
        std::fs::read_dir(dir).unwrap().filter_map(|e| e.ok()).all(|e| {
            let n = e.file_name();
            let n = n.to_string_lossy();
            !(n.starts_with(&format!(".{file_name}.mdv-")) && n.ends_with(".tmp"))
        })
    }

    #[test]
    fn writes_a_new_file() {
        let path = unique_path("new.txt");
        write_atomic(&path, b"hello").unwrap();
        let mut s = String::new();
        std::fs::File::open(&path).unwrap().read_to_string(&mut s).unwrap();
        assert_eq!(s, "hello");
        assert!(no_tmp_files_left(&path));
        std::fs::remove_file(&path).unwrap();
    }

    #[test]
    fn overwrites_an_existing_file() {
        let path = unique_path("existing.txt");
        std::fs::write(&path, b"old").unwrap();
        write_atomic(&path, b"new content").unwrap();
        let mut s = String::new();
        std::fs::File::open(&path).unwrap().read_to_string(&mut s).unwrap();
        assert_eq!(s, "new content");
        assert!(no_tmp_files_left(&path));
        std::fs::remove_file(&path).unwrap();
    }
}

/// Allow the asset protocol to serve files under `dir`, so relative images
/// referenced by the open document can be displayed.
#[tauri::command]
pub fn allow_asset_dir(app: AppHandle, dir: String) -> Result<(), String> {
    app.asset_protocol_scope()
        .allow_directory(PathBuf::from(dir), true)
        .map_err(|e| e.to_string())
}
