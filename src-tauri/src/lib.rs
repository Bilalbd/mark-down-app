mod commands;
mod watch;

use tauri::{Listener, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
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
