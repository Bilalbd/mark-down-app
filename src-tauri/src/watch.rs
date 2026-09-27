//! Watches the files of the open documents (tabs) and notifies the frontend about external changes.
//! Uses one debouncer for all files, watching each folder only once no matter how many files in it are open.

use notify::RecursiveMode;
use notify_debouncer_full::{new_debouncer, DebounceEventResult, Debouncer, RecommendedCache};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

type FileDebouncer = Debouncer<notify::RecommendedWatcher, RecommendedCache>;

/// Which files are watched, grouped by folder. Pure bookkeeping, so the add/remove rules
/// are testable without a real OS watcher.
#[derive(Default)]
struct Registry {
    by_dir: HashMap<PathBuf, HashSet<PathBuf>>,
}

impl Registry {
    /// Add a file to the registry. Returns `Some(dir)` when this is the first file
    /// in that directory (the caller must start watching `dir`), `None` otherwise or
    /// when already watched. A file with no parent (e.g. relative path like "a.txt")
    /// returns `None` and isn't added.
    fn add(&mut self, file: &Path) -> Option<PathBuf> {
        let dir = file.parent()?;
        // Only proceed if parent is not empty (relative paths like "a.txt" are rejected)
        if dir.as_os_str().is_empty() {
            return None;
        }
        let dir_buf = dir.to_path_buf();
        let files = self.by_dir.entry(dir_buf.clone()).or_insert_with(HashSet::new);
        let is_first = files.is_empty();
        files.insert(file.to_path_buf());
        is_first.then_some(dir_buf)
    }

    /// Remove a file from the registry. Returns `Some(dir)` when that was the last
    /// file in that directory (the caller must stop watching it), `None` otherwise
    /// or when the file wasn't in the registry.
    fn remove(&mut self, file: &Path) -> Option<PathBuf> {
        let dir = file.parent()?;
        let files = self.by_dir.get_mut(dir)?;
        files.remove(file);
        let is_last = files.is_empty();
        if is_last {
            self.by_dir.remove(dir);
        }
        is_last.then_some(dir.to_path_buf())
    }

    /// Every watched file whose folder and file name match one of the event paths.
    /// Compares file names case-insensitively (Windows file systems are case-insensitive).
    fn files_touched(&self, event_paths: &[PathBuf]) -> Vec<PathBuf> {
        let mut touched = Vec::new();
        for (dir, files) in &self.by_dir {
            for event_path in event_paths {
                if event_path.parent() == Some(dir.as_path()) {
                    if let Some(event_name) = event_path.file_name() {
                        for file in files {
                            if let Some(file_name) = file.file_name() {
                                if same_name(file_name, event_name) {
                                    touched.push(file.clone());
                                }
                            }
                        }
                    }
                }
            }
        }
        touched
    }
}

/// Compare file names case-insensitively (Windows files are case-insensitive).
fn same_name(a: &std::ffi::OsStr, b: &std::ffi::OsStr) -> bool {
    a.to_string_lossy().to_lowercase() == b.to_string_lossy().to_lowercase()
}

#[derive(Default)]
pub struct WatchState {
    inner: Mutex<WatchStateInner>,
}

struct WatchStateInner {
    registry: Arc<Mutex<Registry>>,
    debouncer: Option<FileDebouncer>,
}

impl Default for WatchStateInner {
    fn default() -> Self {
        Self {
            registry: Arc::new(Mutex::new(Registry::default())),
            debouncer: None,
        }
    }
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

/// Start watching `path` for external changes, alongside any files already watched.
/// Does nothing if `path` is already watched. Editors commonly save by writing a temp
/// file and renaming, so the parent directory is watched and events are filtered to the
/// file of interest. One debouncer watches all folders, reducing CPU and threads.
#[tauri::command]
pub fn watch_file(app: AppHandle, state: State<'_, WatchState>, path: String) -> Result<(), String> {
    let target = PathBuf::from(&path);

    let mut inner = state.inner.lock().map_err(|e| e.to_string())?;

    // Check if already watched
    {
        let registry = inner.registry.lock().map_err(|e| e.to_string())?;
        if registry.by_dir.values().any(|files| files.contains(&target)) {
            return Ok(());
        }
    }

    // Add to registry and see if we need to start watching the folder
    let should_watch_dir = {
        let mut registry = inner.registry.lock().map_err(|e| e.to_string())?;
        registry.add(&target).is_some()
    };

    if should_watch_dir {
        let dir = target
            .parent()
            .ok_or_else(|| "file has no parent directory".to_string())?
            .to_path_buf();

        // Create debouncer if needed
        if inner.debouncer.is_none() {
            let registry = inner.registry.clone();
            let app_handle = app.clone();
            let debouncer = new_debouncer(
                Duration::from_millis(300),
                None,
                move |result: DebounceEventResult| {
                    let Ok(events) = result else { return };
                    let event_paths: Vec<PathBuf> = events.iter().flat_map(|e| &e.paths).cloned().collect();

                    let touched = {
                        let registry = match registry.lock() {
                            Ok(r) => r,
                            Err(_) => return,
                        };
                        registry.files_touched(&event_paths)
                    };

                    for file in touched {
                        let exists = file.exists();
                        let _ = app_handle.emit(
                            "file-changed",
                            FileChanged {
                                path: file.to_string_lossy().into_owned(),
                                mtime: if exists { mtime_ms(&file) } else { 0 },
                                removed: !exists,
                            },
                        );
                    }
                },
            )
            .map_err(|e| e.to_string())?;
            inner.debouncer = Some(debouncer);
        }

        // Watch the directory
        if let Some(debouncer) = &mut inner.debouncer {
            debouncer
                .watch(&dir, RecursiveMode::NonRecursive)
                .map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

/// Stops watching `path` (other watched files keep their watches). Does nothing if it isn't watched.
/// If that was the last file in its folder, stops watching the folder too.
#[tauri::command]
pub fn unwatch_file(state: State<'_, WatchState>, path: String) -> Result<(), String> {
    let mut inner = state.inner.lock().map_err(|e| e.to_string())?;
    let target = PathBuf::from(path);

    let should_unwatch_dir = {
        let mut registry = inner.registry.lock().map_err(|e| e.to_string())?;
        registry.remove(&target).is_some()
    };

    if should_unwatch_dir {
        if let Some(dir) = target.parent() {
            if let Some(debouncer) = &mut inner.debouncer {
                // Ignore errors when unwatching (folder might already be gone)
                let _ = debouncer.unwatch(dir);
            }
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_first_file_in_dir() {
        let mut reg = Registry::default();
        let file = PathBuf::from("/tmp/a.txt");
        let dir_should_watch = reg.add(&file);
        assert_eq!(dir_should_watch, Some(PathBuf::from("/tmp")));
        assert!(reg.by_dir.contains_key(&PathBuf::from("/tmp")));
    }

    #[test]
    fn registry_second_file_in_same_dir() {
        let mut reg = Registry::default();
        let file1 = PathBuf::from("/tmp/a.txt");
        let file2 = PathBuf::from("/tmp/b.txt");
        reg.add(&file1);
        let dir_should_watch = reg.add(&file2);
        assert_eq!(dir_should_watch, None);
    }

    #[test]
    fn registry_already_watched() {
        let mut reg = Registry::default();
        let file = PathBuf::from("/tmp/a.txt");
        reg.add(&file);
        let dir_should_watch = reg.add(&file);
        assert_eq!(dir_should_watch, None);
    }

    #[test]
    fn registry_file_with_no_parent() {
        let mut reg = Registry::default();
        let file = PathBuf::from("a.txt"); // relative path with empty parent
        let dir_should_watch = reg.add(&file);
        // A relative path like "a.txt" has empty parent, which is rejected
        assert_eq!(dir_should_watch, None);
        assert!(reg.by_dir.is_empty());
    }

    #[test]
    fn registry_remove_last_file() {
        let mut reg = Registry::default();
        let file = PathBuf::from("/tmp/a.txt");
        reg.add(&file);
        let dir_should_unwatch = reg.remove(&file);
        assert_eq!(dir_should_unwatch, Some(PathBuf::from("/tmp")));
        assert!(!reg.by_dir.contains_key(&PathBuf::from("/tmp")));
    }

    #[test]
    fn registry_remove_unknown_file() {
        let mut reg = Registry::default();
        let file = PathBuf::from("/tmp/unknown.txt");
        let dir_should_unwatch = reg.remove(&file);
        assert_eq!(dir_should_unwatch, None);
    }

    #[test]
    fn registry_remove_one_of_many() {
        let mut reg = Registry::default();
        let file1 = PathBuf::from("/tmp/a.txt");
        let file2 = PathBuf::from("/tmp/b.txt");
        reg.add(&file1);
        reg.add(&file2);
        let dir_should_unwatch = reg.remove(&file1);
        assert_eq!(dir_should_unwatch, None);
        assert!(reg.by_dir.contains_key(&PathBuf::from("/tmp")));
    }

    #[test]
    fn registry_files_touched_basic() {
        let mut reg = Registry::default();
        let file = PathBuf::from("/tmp/a.txt");
        reg.add(&file);
        let touched = reg.files_touched(&[file.clone()]);
        assert_eq!(touched, vec![file]);
    }

    #[test]
    fn registry_files_touched_case_insensitive() {
        let mut reg = Registry::default();
        let file = PathBuf::from("/tmp/MyFile.txt");
        reg.add(&file);
        let event = PathBuf::from("/tmp/myfile.txt");
        let touched = reg.files_touched(&[event]);
        assert_eq!(touched, vec![file]);
    }

    #[test]
    fn registry_files_touched_rename_event() {
        let mut reg = Registry::default();
        let file = PathBuf::from("/tmp/old.txt");
        reg.add(&file);
        let event_old = PathBuf::from("/tmp/old.txt");
        let event_new = PathBuf::from("/tmp/new.txt");
        let touched = reg.files_touched(&[event_old, event_new]);
        // Only the watched file matches
        assert_eq!(touched, vec![file]);
    }

    #[test]
    fn registry_files_touched_unrelated_file() {
        let mut reg = Registry::default();
        let file = PathBuf::from("/tmp/a.txt");
        reg.add(&file);
        let event = PathBuf::from("/tmp/b.txt");
        let touched = reg.files_touched(&[event]);
        assert!(touched.is_empty());
    }

    #[test]
    fn registry_two_folders() {
        let mut reg = Registry::default();
        let file1 = PathBuf::from("/tmp/a.txt");
        let file2 = PathBuf::from("/home/b.txt");
        let dir1 = reg.add(&file1);
        let dir2 = reg.add(&file2);
        assert_eq!(dir1, Some(PathBuf::from("/tmp")));
        assert_eq!(dir2, Some(PathBuf::from("/home")));
    }
}
