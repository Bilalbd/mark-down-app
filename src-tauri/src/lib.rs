mod assets;
mod commands;
mod instance;
mod spell;
mod watch;

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::{Emitter, Listener, Manager};
use tauri_plugin_window_state::{StateFlags, WindowExt};

const IDENTIFIER: &str = "com.bilal.markdown-viewer";
const SHOW_FALLBACK: Duration = Duration::from_secs(5);
const STARTUP_WATCHDOG: Duration = Duration::from_secs(15);

/// Set to true when the app-ready event is received from the frontend.
static APP_READY: AtomicBool = AtomicBool::new(false);

/// Set to true when .setup() completes. Used by the startup watchdog.
static SETUP_DONE: AtomicBool = AtomicBool::new(false);

/// Set to true when the window is first revealed to the user.
static REVEALED: AtomicBool = AtomicBool::new(false);

/// Build relaunch arguments: returns None if already relaunched, else args[1..] plus --new-window (not duplicated) and --relaunched.
fn relaunch_args(args: &[String]) -> Option<Vec<String>> {
    if args.iter().any(|a| a == "--relaunched") {
        return None;
    }
    let mut new_args = Vec::new();
    for (i, arg) in args.iter().enumerate() {
        if i == 0 {
            continue;
        }
        if arg == "--new-window" || arg == "--relaunched" {
            continue;
        }
        new_args.push(arg.clone());
    }
    if !new_args.iter().any(|a| a == "--new-window") {
        new_args.push("--new-window".to_string());
    }
    new_args.push("--relaunched".to_string());
    Some(new_args)
}

#[cfg(windows)]
fn show_startup_error() {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;

    let message = "Markdown couldn't start. Please try again.";
    let title = "Markdown";

    let message_wide: Vec<u16> = OsStr::new(message)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let title_wide: Vec<u16> = OsStr::new(title)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    unsafe {
        let _ = windows_sys::Win32::UI::WindowsAndMessaging::MessageBoxW(
            std::ptr::null_mut(),
            message_wide.as_ptr(),
            title_wide.as_ptr(),
            windows_sys::Win32::UI::WindowsAndMessaging::MB_ICONERROR,
        );
    }
}

#[cfg(not(windows))]
fn show_startup_error() {}

/// Whether `url` is a location the app's own webview should be allowed to navigate to.
/// Everything else (a relative `.md` link resolving to a real navigation, `file:`, a
/// spoofed external site, etc.) is blocked - the frontend handles those links itself
/// (see `src/lib/links.ts`) and a top-level navigation would otherwise reload the app
/// with unsaved work lost and no prompt.
fn is_app_url(url: &tauri::Url) -> bool {
    match url.scheme() {
        "tauri" => true,
        "http" | "https" => match url.host_str() {
            Some("tauri.localhost") => true,
            Some("localhost") => cfg!(debug_assertions), // Vite dev server
            _ => false,
        },
        "about" => true,
        _ => false,
    }
}

/// Uncloak the window on first call, then show and focus.
fn reveal(window: &tauri::WebviewWindow) {
    if !REVEALED.swap(true, Ordering::SeqCst) {
        instance::set_cloaked(window, false);
    }
    let _ = window.show();
    let _ = window.set_focus();
}

/// Fallback WebView2 data folder path.
fn fallback_webview_dir(local_app_data: &Path) -> PathBuf {
    local_app_data.join(IDENTIFIER).join("EBWebView-fallback")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let args: Vec<String> = std::env::args().collect();
    let is_relaunched = args.iter().any(|a| a == "--relaunched");
    let new_window = args.iter().any(|a| a == "--new-window");

    // Probe for a hung existing instance (plugin's SendMessageW has no timeout).
    let existing_hung = !is_relaunched && instance::existing_instance_is_hung(IDENTIFIER);
    let new_window = new_window || existing_hung;

    // A hung instance can stall the shared WebView2 browser process.
    // Use a fallback data folder; the app keeps no data in WebView2 storage.
    if (existing_hung || is_relaunched)
        && std::env::var_os("WEBVIEW2_USER_DATA_FOLDER").is_none()
    {
        if let Some(local_app_data) = std::env::var_os("LOCALAPPDATA") {
            let path = fallback_webview_dir(Path::new(&local_app_data));
            std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", path);
        }
    }

    // Watchdog: relaunch if setup doesn't complete in time.
    {
        let args_owned = args.clone();
        std::thread::spawn(move || {
            std::thread::sleep(STARTUP_WATCHDOG);
            if !SETUP_DONE.load(Ordering::Relaxed) {
                match relaunch_args(&args_owned) {
                    None => {
                        show_startup_error();
                        std::process::exit(1);
                    }
                    Some(new_args) => {
                        if let Ok(exe) = std::env::current_exe() {
                            let _ = std::process::Command::new(exe).args(&new_args).spawn();
                        }
                        std::process::exit(1);
                    }
                }
            }
        });
    }

    let mut builder = tauri::Builder::default();

    // Add single-instance plugin first, but only if not launching with --new-window.
    // Windows launched with --new-window skip the plugin so they don't take the lock
    // or forward to the first window. Also skip if an existing instance was detected as hung.
    if !new_window {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            if let Some(path) = commands::launch_path(&argv, Path::new(&cwd)) {
                if let Ok(mut pending) = app.state::<commands::PendingOpens>().0.lock() {
                    pending.push(path);
                }
                let _ = app.emit("open-requested", ());
            }
            if let Some(w) = app.get_webview_window("main") {
                if REVEALED.load(Ordering::SeqCst) {
                    let _ = w.unminimize();
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
        }));
    }

    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        // VISIBLE isn't restored; the window stays cloaked until reveal() uncloaks it.
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(StateFlags::all() & !StateFlags::VISIBLE)
                .skip_initial_state("main")
                .build(),
        )
        .plugin(
            tauri::plugin::Builder::<tauri::Wry, ()>::new("navigation-guard")
                .on_navigation(|_webview, url| is_app_url(url))
                .build(),
        )
        .manage(watch::WatchState::default())
        .manage(assets::AssetRoot::default())
        .manage(commands::PendingOpens::default())
        .manage(spell::SpellState::default())
        .register_asynchronous_uri_scheme_protocol("mdasset", |ctx, request, responder| {
            let root = match ctx.app_handle().state::<assets::AssetRoot>().0.lock() {
                Ok(guard) => guard.clone(),
                Err(_) => None,
            };
            // Reading the image runs off the UI thread, so a large file can't freeze the window.
            tauri::async_runtime::spawn_blocking(move || {
                let response = assets::handler(root, request);
                responder.respond(response);
            });
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_launch_args,
            commands::read_file,
            commands::write_file,
            commands::take_pending_opens,
            commands::open_in_new_window,
            assets::set_asset_root,
            assets::read_asset_data_url,
            watch::watch_file,
            watch::unwatch_file,
            spell::spell_languages,
            spell::spell_check,
            spell::spell_suggest
        ])
        .setup(|app| {
            let window = app.get_webview_window("main").expect("main window exists");

            // Cloak window, restore state, show for layout/paint (all off-screen); uncloak in reveal().
            instance::set_cloaked(&window, true);
            let _ = window.restore_state(StateFlags::all() & !StateFlags::VISIBLE);
            let _ = window.show();

            // Listen for app-ready from the frontend and reveal the window.
            {
                let w = window.clone();
                app.handle().clone().listen("app-ready", move |_event| {
                    APP_READY.store(true, Ordering::Relaxed);
                    reveal(&w);
                });
            }

            // Fallback: if app-ready doesn't arrive, reveal the window anyway after SHOW_FALLBACK.
            {
                let w = window.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(SHOW_FALLBACK);
                    if !APP_READY.load(Ordering::Relaxed) {
                        reveal(&w);
                    }
                });
            }

            SETUP_DONE.store(true, Ordering::Relaxed);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn url(s: &str) -> tauri::Url {
        s.parse().unwrap()
    }

    #[test]
    fn allows_the_app_itself() {
        assert!(is_app_url(&url("tauri://localhost/index.html")));
        assert!(is_app_url(&url("http://tauri.localhost/index.html")));
        assert!(is_app_url(&url("about:blank")));
    }

    #[test]
    fn blocks_external_and_file_navigation() {
        assert!(!is_app_url(&url("https://example.com")));
        assert!(!is_app_url(&url("http://example.com")));
        assert!(!is_app_url(&url("file:///C:/Windows/win.ini")));
        assert!(!is_app_url(&url("javascript:alert(1)")));
    }

    #[test]
    fn relaunch_args_adds_both_flags() {
        let args = vec!["exe".to_string(), "file.md".to_string()];
        let result = relaunch_args(&args);
        assert_eq!(
            result,
            Some(vec![
                "file.md".to_string(),
                "--new-window".to_string(),
                "--relaunched".to_string()
            ])
        );
    }

    #[test]
    fn relaunch_args_does_not_duplicate_new_window() {
        let args = vec![
            "exe".to_string(),
            "--new-window".to_string(),
            "file.md".to_string(),
        ];
        let result = relaunch_args(&args);
        assert_eq!(
            result,
            Some(vec![
                "file.md".to_string(),
                "--new-window".to_string(),
                "--relaunched".to_string()
            ])
        );
    }

    #[test]
    fn relaunch_args_returns_none_when_already_relaunched() {
        let args = vec![
            "exe".to_string(),
            "--relaunched".to_string(),
            "file.md".to_string(),
        ];
        let result = relaunch_args(&args);
        assert_eq!(result, None);
    }

    #[test]
    fn fallback_webview_dir_joins_identifier_and_folder() {
        let base = Path::new("C:\\Users\\test\\AppData\\Local");
        let result = fallback_webview_dir(base);
        let expected = base.join(IDENTIFIER).join("EBWebView-fallback");
        assert_eq!(result, expected);
    }
}
