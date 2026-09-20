//! Watches the currently open file and notifies the frontend about external changes.

use notify::RecursiveMode;
use notify_debouncer_full::{new_debouncer, DebounceEventResult, Debouncer, RecommendedCache};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

type FileDebouncer = Debouncer<notify::RecommendedWatcher, RecommendedCache>;

#[derive(Default)]
pub struct WatchState {
    inner: Mutex<Option<(PathBuf, FileDebouncer)>>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileChanged {
    path: String,
    /// Modification time in ms since the Unix epoch, or 0 if the file is gone.
    mtime: u64,
    removed: bool,
}

fn mtime_ms(path: &Path) -> u64 {
    std::fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Start watching `path`, replacing any previous watch. Editors commonly save by
/// writing a temp file and renaming, so the parent directory is watched and events
/// are filtered to the file of interest.
#[tauri::command]
pub fn watch_file(app: AppHandle, state: State<'_, WatchState>, path: String) -> Result<(), String> {
    let target = PathBuf::from(&path);
    let dir = target
        .parent()
        .ok_or_else(|| "file has no parent directory".to_string())?
        .to_path_buf();
    let file_name = target.file_name().map(|n| n.to_os_string());

    let app_handle = app.clone();
    let watched = target.clone();
    let mut debouncer = new_debouncer(
        Duration::from_millis(300),
        None,
        move |result: DebounceEventResult| {
            let Ok(events) = result else { return };
            let touches_file = events.iter().any(|e| {
                e.paths
                    .iter()
                    .any(|p| p.file_name().map(|n| n.to_os_string()) == file_name)
            });
            if !touches_file {
                return;
            }
            let exists = watched.exists();
            let _ = app_handle.emit(
                "file-changed",
                FileChanged {
                    path: watched.to_string_lossy().into_owned(),
                    mtime: if exists { mtime_ms(&watched) } else { 0 },
                    removed: !exists,
                },
            );
        },
    )
    .map_err(|e| e.to_string())?;

    debouncer
        .watch(&dir, RecursiveMode::NonRecursive)
        .map_err(|e| e.to_string())?;

    let mut guard = state.inner.lock().map_err(|e| e.to_string())?;
    *guard = Some((target, debouncer));
    Ok(())
}

#[tauri::command]
pub fn unwatch_file(state: State<'_, WatchState>) -> Result<(), String> {
    let mut guard = state.inner.lock().map_err(|e| e.to_string())?;
    *guard = None;
    Ok(())
}
