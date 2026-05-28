use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, RunEvent, State};

mod pty;

use pty::{PtyError, SessionRegistry};

#[derive(Debug, Serialize, Deserialize)]
pub struct AppInfo {
    pub name: String,
    pub version: String,
}

#[tauri::command]
fn app_info() -> AppInfo {
    AppInfo {
        name: env!("CARGO_PKG_NAME").to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    }
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {name}! You are talking to Workhorse Assistant.")
}

#[tauri::command]
fn pty_spawn(
    app: AppHandle,
    registry: State<'_, SessionRegistry>,
    profile_id: String,
    cols: Option<u16>,
    rows: Option<u16>,
) -> Result<String, PtyError> {
    registry.spawn(&app, &profile_id, cols, rows)
}

#[tauri::command]
fn pty_write(
    registry: State<'_, SessionRegistry>,
    session_id: String,
    data: String,
) -> Result<(), PtyError> {
    registry.write(&session_id, &data)
}

#[tauri::command]
fn pty_resize(
    registry: State<'_, SessionRegistry>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), PtyError> {
    registry.resize(&session_id, cols, rows)
}

#[tauri::command]
fn pty_kill(registry: State<'_, SessionRegistry>, session_id: String) -> Result<(), PtyError> {
    registry.kill(&session_id)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(SessionRegistry::default())
        .setup(|app| {
            // Windows 11: a borderless (`decorations: false`) window is NOT
            // rounded by DWM and keeps a square region, so the corners outside
            // the renderer's CSS radius get painted with the system backdrop (a
            // grey "toolbar" colour) instead of being clipped. Opt the OS window
            // region into rounded corners so the corners are truly cut and the
            // drop shadow follows — matching the rounded look Linux/WSL already
            // gets from the transparent surface. No-op on other platforms.
            #[cfg(target_os = "windows")]
            if let Some(window) = app.get_webview_window("main") {
                round_window_corners(&window);
            }
            let _ = &app;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_info,
            greet,
            pty_spawn,
            pty_write,
            pty_resize,
            pty_kill
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app_handle, event| {
            // Kill every live PTY child when the app exits or its window is
            // destroyed, even if no renderer unmount fired (design D10).
            if let RunEvent::Exit = event {
                app_handle.state::<SessionRegistry>().kill_all();
            } else if let RunEvent::WindowEvent {
                event: tauri::WindowEvent::Destroyed,
                ..
            } = event
            {
                app_handle.state::<SessionRegistry>().kill_all();
            }
        });
}

/// Round the OS window region on Windows 11 via the DWM corner preference.
/// Linked directly against `dwmapi` to avoid pulling in the heavy `windows`
/// crate for a single call. The HWND is taken as `isize` so it stays correct
/// whether Tauri's `HWND.0` is a raw pointer or an integer.
#[cfg(target_os = "windows")]
fn round_window_corners(window: &tauri::WebviewWindow) {
    use std::ffi::c_void;

    // DWMWA_WINDOW_CORNER_PREFERENCE = 33; DWMWCP_ROUND = 2.
    const DWMWA_WINDOW_CORNER_PREFERENCE: u32 = 33;
    const DWMWCP_ROUND: u32 = 2;

    #[link(name = "dwmapi")]
    extern "system" {
        fn DwmSetWindowAttribute(
            hwnd: isize,
            attribute: u32,
            value: *const c_void,
            value_size: u32,
        ) -> i32;
    }

    if let Ok(hwnd) = window.hwnd() {
        let preference: u32 = DWMWCP_ROUND;
        unsafe {
            DwmSetWindowAttribute(
                hwnd.0 as isize,
                DWMWA_WINDOW_CORNER_PREFERENCE,
                &preference as *const u32 as *const c_void,
                std::mem::size_of::<u32>() as u32,
            );
        }
    }
}
