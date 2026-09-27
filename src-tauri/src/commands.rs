use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use std::sync::Mutex;

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum Encoding {
    Utf8,
    Utf8Bom,
    Utf16Le,
    Utf16Be,
}

/// Decodes raw file bytes, detecting BOM-marked UTF-8/UTF-16. `lossy` is true when
/// invalid bytes had to be replaced (with U+FFFD) to produce valid text.
fn decode(bytes: &[u8]) -> (String, Encoding, bool) {
    if let Some(rest) = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]) {
        match std::str::from_utf8(rest) {
            Ok(s) => (s.to_string(), Encoding::Utf8Bom, false),
            Err(_) => (
                String::from_utf8_lossy(rest).into_owned(),
                Encoding::Utf8Bom,
                true,
            ),
        }
    } else if let Some(rest) = bytes.strip_prefix(&[0xFF, 0xFE]) {
        let (s, lossy) = decode_utf16(rest, u16::from_le_bytes);
        (s, Encoding::Utf16Le, lossy)
    } else if let Some(rest) = bytes.strip_prefix(&[0xFE, 0xFF]) {
        let (s, lossy) = decode_utf16(rest, u16::from_be_bytes);
        (s, Encoding::Utf16Be, lossy)
    } else {
        match std::str::from_utf8(bytes) {
            Ok(s) => (s.to_string(), Encoding::Utf8, false),
            Err(_) => (String::from_utf8_lossy(bytes).into_owned(), Encoding::Utf8, true),
        }
    }
}

fn decode_utf16(bytes: &[u8], read_u16: fn([u8; 2]) -> u16) -> (String, bool) {
    let mut lossy = bytes.len() % 2 != 0;
    let units = bytes
        .chunks_exact(2)
        .map(|c| read_u16([c[0], c[1]]));
    let mut s = String::with_capacity(bytes.len() / 2);
    for r in char::decode_utf16(units) {
        match r {
            Ok(c) => s.push(c),
            Err(_) => {
                lossy = true;
                s.push('\u{FFFD}');
            }
        }
    }
    (s, lossy)
}

/// Re-encodes `content` (always valid UTF-8 in memory) back to `enc`, re-adding any BOM.
fn encode(content: &str, enc: Encoding) -> Vec<u8> {
    match enc {
        Encoding::Utf8 => content.as_bytes().to_vec(),
        Encoding::Utf8Bom => {
            let mut v = vec![0xEF, 0xBB, 0xBF];
            v.extend_from_slice(content.as_bytes());
            v
        }
        Encoding::Utf16Le => {
            let mut v = vec![0xFF, 0xFE];
            for u in content.encode_utf16() {
                v.extend_from_slice(&u.to_le_bytes());
            }
            v
        }
        Encoding::Utf16Be => {
            let mut v = vec![0xFE, 0xFF];
            for u in content.encode_utf16() {
                v.extend_from_slice(&u.to_be_bytes());
            }
            v
        }
    }
}

/// The file to open from a command line (`args[0]` is the exe): the first argument that isn't
/// a flag, made absolute against `cwd` and normalised.
pub fn launch_path(args: &[String], cwd: &Path) -> Option<String> {
    args.iter()
        .skip(1) // Skip args[0], which is the exe path
        .find(|a| !a.starts_with('-'))
        .map(|a| {
            let path = PathBuf::from(a);
            let absolute = if path.is_absolute() {
                path
            } else {
                cwd.join(&path)
            };
            // Normalise redundant separators (e.g. doubled backslashes from shell quoting).
            let normalised: PathBuf = absolute.components().collect();
            normalised.to_string_lossy().into_owned()
        })
}

/// Returns the file path passed on the command line, if any.
/// Set when the app is launched via a `.md` file association or "Open With".
#[tauri::command]
pub fn get_launch_args() -> Option<String> {
    launch_path(&std::env::args().collect::<Vec<_>>(), &std::env::current_dir().unwrap_or_default())
}

/// Files forwarded by later launches (single-instance), waiting for the frontend to open them.
#[derive(Default)]
pub struct PendingOpens(pub Mutex<Vec<String>>);

/// Returns and clears the forwarded files.
#[tauri::command]
pub fn take_pending_opens(state: tauri::State<'_, PendingOpens>) -> Result<Vec<String>, String> {
    let mut pending = state.0.lock().map_err(|e| e.to_string())?;
    Ok(std::mem::take(&mut *pending))
}

/// Starts another copy of the app showing `path` in its own window ("Open files in: New window").
#[tauri::command]
pub fn open_in_new_window(path: String) -> Result<(), String> {
    if !Path::new(&path).is_file() {
        return Err("not a file".to_string());
    }
    std::process::Command::new(std::env::current_exe().map_err(|e| e.to_string())?)
        .arg("--new-window")
        .arg(&path)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Serialize)]
pub struct FileData {
    content: String,
    /// Modification time in milliseconds since the Unix epoch.
    mtime: u64,
    encoding: Encoding,
    /// True when the file had bytes that aren't valid text in its encoding, so they
    /// were replaced with U+FFFD; saving would make that replacement permanent.
    lossy: bool,
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
    let (content, encoding, lossy) = decode(&bytes);
    Ok(FileData {
        content,
        mtime: mtime_ms(&p)?,
        encoding,
        lossy,
    })
}

#[tauri::command]
pub fn write_file(path: String, content: String, encoding: Option<Encoding>) -> Result<u64, String> {
    let p = PathBuf::from(&path);
    let bytes = encode(&content, encoding.unwrap_or(Encoding::Utf8));
    write_atomic(&p, &bytes).map_err(|e| e.to_string())?;
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

#[cfg(test)]
mod encoding_tests {
    use super::*;

    #[test]
    fn round_trips_utf8() {
        let bytes = "hello π".as_bytes();
        let (s, enc, lossy) = decode(bytes);
        assert_eq!(s, "hello π");
        assert_eq!(enc, Encoding::Utf8);
        assert!(!lossy);
        assert_eq!(encode(&s, enc), bytes);
    }

    #[test]
    fn round_trips_utf8_bom() {
        let mut bytes = vec![0xEF, 0xBB, 0xBF];
        bytes.extend_from_slice("# Title".as_bytes());
        let (s, enc, lossy) = decode(&bytes);
        assert_eq!(s, "# Title");
        assert_eq!(enc, Encoding::Utf8Bom);
        assert!(!lossy);
        assert_eq!(encode(&s, enc), bytes);
    }

    #[test]
    fn round_trips_utf16_le() {
        let mut bytes = vec![0xFF, 0xFE];
        for u in "hi π".encode_utf16() {
            bytes.extend_from_slice(&u.to_le_bytes());
        }
        let (s, enc, lossy) = decode(&bytes);
        assert_eq!(s, "hi π");
        assert_eq!(enc, Encoding::Utf16Le);
        assert!(!lossy);
        assert_eq!(encode(&s, enc), bytes);
    }

    #[test]
    fn round_trips_utf16_be() {
        let mut bytes = vec![0xFE, 0xFF];
        for u in "hi π".encode_utf16() {
            bytes.extend_from_slice(&u.to_be_bytes());
        }
        let (s, enc, lossy) = decode(&bytes);
        assert_eq!(s, "hi π");
        assert_eq!(enc, Encoding::Utf16Be);
        assert!(!lossy);
        assert_eq!(encode(&s, enc), bytes);
    }

    #[test]
    fn marks_invalid_utf8_bytes_as_lossy() {
        let bytes = vec![b'a', 0xFF, b'b'];
        let (s, enc, lossy) = decode(&bytes);
        assert_eq!(enc, Encoding::Utf8);
        assert!(lossy);
        assert!(s.contains('\u{FFFD}'));
    }

    #[test]
    fn marks_an_odd_byte_count_utf16_file_as_lossy() {
        let bytes = vec![0xFF, 0xFE, b'a', 0x00, b'b']; // trailing unpaired byte
        let (_, enc, lossy) = decode(&bytes);
        assert_eq!(enc, Encoding::Utf16Le);
        assert!(lossy);
    }

    #[test]
    fn marks_an_unpaired_surrogate_in_utf16_as_lossy() {
        let mut bytes = vec![0xFE, 0xFF];
        bytes.extend_from_slice(&0xD800u16.to_be_bytes()); // lone high surrogate
        let (s, enc, lossy) = decode(&bytes);
        assert_eq!(enc, Encoding::Utf16Be);
        assert!(lossy);
        assert!(s.contains('\u{FFFD}'));
    }

    /// Locks the wire format the frontend's `Encoding` union (`src/lib/tauri.ts`) expects.
    #[test]
    fn encoding_serializes_to_the_frontend_wire_format() {
        assert_eq!(serde_json::to_string(&Encoding::Utf8).unwrap(), "\"utf8\"");
        assert_eq!(
            serde_json::to_string(&Encoding::Utf8Bom).unwrap(),
            "\"utf8-bom\""
        );
        assert_eq!(
            serde_json::to_string(&Encoding::Utf16Le).unwrap(),
            "\"utf16-le\""
        );
        assert_eq!(
            serde_json::to_string(&Encoding::Utf16Be).unwrap(),
            "\"utf16-be\""
        );
    }
}

#[cfg(test)]
mod launch_path_tests {
    use super::*;

    #[test]
    fn takes_absolute_path_as_is() {
        let args = vec!["exe".to_string(), "C:\\Users\\test\\file.md".to_string()];
        let result = launch_path(&args, Path::new("C:\\home"));
        assert_eq!(result, Some("C:\\Users\\test\\file.md".to_string()));
    }

    #[test]
    fn joins_relative_path_to_cwd() {
        let args = vec!["exe".to_string(), "file.md".to_string()];
        let result = launch_path(&args, Path::new("C:\\home"));
        assert_eq!(result, Some("C:\\home\\file.md".to_string()));
    }

    #[test]
    fn skips_flags_starting_with_dash() {
        let args = vec!["exe".to_string(), "--new-window".to_string(), "C:\\file.md".to_string()];
        let result = launch_path(&args, Path::new("C:\\home"));
        assert_eq!(result, Some("C:\\file.md".to_string()));
    }

    #[test]
    fn returns_none_when_no_file_argument() {
        let args = vec!["exe".to_string(), "--new-window".to_string()];
        let result = launch_path(&args, Path::new("C:\\home"));
        assert_eq!(result, None);
    }

    #[test]
    fn normalises_doubled_backslashes() {
        let args = vec!["exe".to_string(), "C:\\\\Users\\\\test\\\\file.md".to_string()];
        let result = launch_path(&args, Path::new("C:\\home"));
        assert_eq!(result, Some("C:\\Users\\test\\file.md".to_string()));
    }

    #[test]
    fn skips_relaunched_flag() {
        let args = vec!["exe".to_string(), "--relaunched".to_string(), "C:\\file.md".to_string()];
        let result = launch_path(&args, Path::new("C:\\home"));
        assert_eq!(result, Some("C:\\file.md".to_string()));
    }
}
