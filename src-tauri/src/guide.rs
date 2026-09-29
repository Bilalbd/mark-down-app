//! The guide window: a second, read-only window (label `guide`) that shows the built-in guide.
//! One per app process. It has its own simple reveal, separate from the main window's.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Listener, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use crate::instance;

/// The guide window's label; its capability file (`capabilities/guide.json`) is keyed on it.
pub const LABEL: &str = "guide";

/// The app's page with a marker the frontend reads to render the guide instead of the main app.
const URL: &str = "index.html#guide";

/// Emitted by the guide's frontend once the guide has rendered.
const READY_EVENT: &str = "guide-ready";

/// Reveals the window anyway if the ready event never arrives.
const SHOW_FALLBACK: Duration = Duration::from_secs(5);

/// Serialises `open_guide_window`, so two quick F1 presses can't both build the window.
#[derive(Default)]
pub struct GuideState(Mutex<()>);

/// Whether closing the window labelled `label` should also close the guide window.
pub fn closes_guide(label: &str) -> bool {
    label == "main"
}

/// Uncloaks, shows and focuses the window (all idempotent).
fn reveal(window: &WebviewWindow) {
    instance::set_cloaked(window, false);
    let _ = window.show();
    let _ = window.set_focus();
}

/// Closes the guide window, if there is one (used when the main window goes away).
pub fn close(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(LABEL) {
        let _ = window.close();
    }
}

/// Focuses the guide window, or builds it (hidden, then revealed once it has rendered).
#[tauri::command]
pub async fn open_guide_window(app: AppHandle) -> Result<(), String> {
    let state = app.state::<GuideState>();
    let _guard = state.0.lock().map_err(|e| e.to_string())?;

    if let Some(window) = app.get_webview_window(LABEL) {
        let _ = window.unminimize();
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    let window = WebviewWindowBuilder::new(&app, LABEL, WebviewUrl::App(URL.into()))
        .title("Guide")
        .inner_size(900.0, 800.0)
        .min_inner_size(480.0, 320.0)
        .center()
        .decorations(false)
        .visible(false)
        .background_color(tauri::window::Color(32, 32, 32, 255))
        .build()
        .map_err(|e| e.to_string())?;

    // Like the main window: cloaked while it lays out and paints, so nothing flashes.
    instance::set_cloaked(&window, true);
    let _ = window.show();

    let revealed = Arc::new(AtomicBool::new(false));
    {
        let w = window.clone();
        let revealed = revealed.clone();
        app.once(READY_EVENT, move |_event| {
            if !revealed.swap(true, Ordering::SeqCst) {
                reveal(&w);
            }
        });
    }
    std::thread::spawn(move || {
        std::thread::sleep(SHOW_FALLBACK);
        if !revealed.swap(true, Ordering::SeqCst) {
            reveal(&window);
        }
    });

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_main_window_closes_the_guide() {
        assert!(closes_guide("main"));
        assert!(!closes_guide(LABEL));
        assert!(!closes_guide("other"));
    }

    #[test]
    fn the_marker_survives_being_joined_onto_the_app_url() {
        // Dev server, and the release build's scheme on Windows.
        for base in ["http://localhost:1420", "http://tauri.localhost"] {
            let base: tauri::Url = base.parse().unwrap();
            let url = base.join(URL).unwrap();
            assert_eq!(url.fragment(), Some("guide"));
            assert_eq!(url.path(), "/index.html");
        }
    }
}
