mod commands;
mod watch;

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
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
