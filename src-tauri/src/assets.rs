use percent_encoding::percent_decode_str;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::http::{header::CONTENT_TYPE, Request, Response, StatusCode};
use tauri::{AppHandle, Manager, Runtime, UriSchemeContext};

/// The open document's folder (canonicalised), or `None` for an untitled document.
/// Replaces every previous `set_asset_root` call - only the current document's own
/// folder is ever servable, and access can't build up across files like the old
/// asset-protocol scope did.
#[derive(Default)]
pub struct AssetRoot(pub Mutex<Option<PathBuf>>);

#[tauri::command]
pub fn set_asset_root(app: AppHandle, dir: Option<String>) -> Result<(), String> {
    let resolved = match dir {
        Some(d) => Some(std::fs::canonicalize(d).map_err(|e| e.to_string())?),
        None => None,
    };
    *app.state::<AssetRoot>().0.lock().map_err(|e| e.to_string())? = resolved;
    Ok(())
}

/// True when `requested`, canonicalised, is `root` or lives under it. Canonicalising
/// (rather than just normalising `..` segments) also closes off a symlink that points
/// outside `root`. Returns false - never errors - for anything that doesn't resolve.
fn is_within_root(requested: &Path, root: &Path) -> bool {
    requested
        .canonicalize()
        .map(|canon| canon.starts_with(root))
        .unwrap_or(false)
}

fn content_type_for(path: &Path) -> &'static str {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "avif" => "image/avif",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        "svg" => "image/svg+xml",
        _ => "application/octet-stream",
    }
}

fn empty_response(status: StatusCode) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .body(Vec::new())
        .unwrap()
}

/// Handler for the `mdasset://` protocol, registered in `lib.rs`. Serves only files
/// under the current document's folder (`AssetRoot`), so relative images can load
/// without the unboundedly-growing access the old `asset:` scope allowed.
pub fn handler<R: Runtime>(
    ctx: UriSchemeContext<'_, R>,
    request: Request<Vec<u8>>,
) -> Response<Vec<u8>> {
    let root = match ctx.app_handle().state::<AssetRoot>().0.lock() {
        Ok(guard) => guard.clone(),
        Err(_) => None,
    };
    let Some(root) = root else {
        return empty_response(StatusCode::FORBIDDEN);
    };

    let raw_path = request.uri().path();
    let decoded = percent_decode_str(raw_path).decode_utf8_lossy().into_owned();
    let requested = PathBuf::from(decoded.strip_prefix('/').unwrap_or(&decoded));

    if !is_within_root(&requested, &root) {
        return empty_response(StatusCode::FORBIDDEN);
    }

    match std::fs::read(&requested) {
        Ok(bytes) => Response::builder()
            .header(CONTENT_TYPE, content_type_for(&requested))
            .body(bytes)
            .unwrap(),
        Err(_) => empty_response(StatusCode::NOT_FOUND),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn unique_dir(name: &str) -> PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!(
            "mdv-assets-test-{}-{}-{}",
            std::process::id(),
            nanos,
            name
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn allows_a_file_inside_the_root() {
        let root = unique_dir("root-allowed");
        let file = root.join("img.png");
        std::fs::write(&file, b"x").unwrap();
        let root = root.canonicalize().unwrap();

        assert!(is_within_root(&file, &root));

        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn allows_a_file_in_a_subdirectory_of_the_root() {
        let root = unique_dir("root-subdir");
        let sub = root.join("images");
        std::fs::create_dir_all(&sub).unwrap();
        let file = sub.join("img.png");
        std::fs::write(&file, b"x").unwrap();
        let root = root.canonicalize().unwrap();

        assert!(is_within_root(&file, &root));

        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn blocks_a_sibling_directory() {
        let root = unique_dir("root-sibling-a");
        let sibling = unique_dir("root-sibling-b");
        let file = sibling.join("secret.png");
        std::fs::write(&file, b"x").unwrap();
        let root = root.canonicalize().unwrap();

        assert!(!is_within_root(&file, &root));

        std::fs::remove_dir_all(&root).unwrap();
        std::fs::remove_dir_all(&sibling).unwrap();
    }

    #[test]
    fn blocks_dot_dot_traversal_outside_the_root() {
        let root = unique_dir("root-traversal");
        let sub = root.join("images");
        std::fs::create_dir_all(&sub).unwrap();
        let outside = unique_dir("root-traversal-outside");
        let secret = outside.join("secret.png");
        std::fs::write(&secret, b"x").unwrap();
        let root_canon = root.canonicalize().unwrap();

        // ".../images/../../<outside-dir-name>/secret.png" - never actually walks off the
        // filesystem, but resolves outside `root` once canonicalised.
        let traversal = sub.join("..").join("..").join(outside.file_name().unwrap()).join("secret.png");

        assert!(!is_within_root(&traversal, &root_canon));

        std::fs::remove_dir_all(&root_canon).unwrap();
        std::fs::remove_dir_all(&outside).unwrap();
    }

    #[test]
    fn blocks_a_path_that_does_not_exist() {
        let root = unique_dir("root-missing");
        let root = root.canonicalize().unwrap();
        assert!(!is_within_root(&root.join("nope.png"), &root));
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn content_type_mapping() {
        assert_eq!(content_type_for(Path::new("a.png")), "image/png");
        assert_eq!(content_type_for(Path::new("a.JPG")), "image/jpeg");
        assert_eq!(content_type_for(Path::new("a.svg")), "image/svg+xml");
        assert_eq!(content_type_for(Path::new("a.unknown")), "application/octet-stream");
        assert_eq!(content_type_for(Path::new("noext")), "application/octet-stream");
    }
}
