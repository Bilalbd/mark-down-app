mod commands;
mod watch;

use tauri::{Listener, Manager};

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(
            tauri::plugin::Builder::<tauri::Wry, ()>::new("navigation-guard")
                .on_navigation(|_webview, url| is_app_url(url))
                .build(),
        )
        .manage(watch::WatchState::default())
        .invoke_handler(tauri::generate_handler![
            commands::get_launch_args,
            commands::read_file,
            commands::write_file,
            commands::allow_asset_dir,
            watch::watch_file,
            watch::unwatch_file
        ])
        .setup(|app| {
            // The window starts hidden (tauri.conf.json) so the native frame and
            // tauri-plugin-window-state's geometry restore never paint a blank
            // window; the frontend shows it once React has painted a first frame.
            let window = app.get_webview_window("main").expect("main window exists");
            app.handle().clone().listen("app-ready", move |_event| {
                let _ = window.show();
                let _ = window.set_focus();
            });
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
}
