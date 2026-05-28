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
