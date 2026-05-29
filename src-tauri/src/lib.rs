use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Manager, RunEvent, State};

mod agent;
mod pty;

use agent::{AgentBridge, AgentError};
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

// Runs off the main (event-loop) thread: on Windows the ConPTY spawn
// (CreatePseudoConsole + launching the child) is heavy enough to stall the GUI
// message loop and trip IsHungAppWindow. `(async)` makes Tauri dispatch this
// synchronous body to a worker thread so the window keeps pumping messages.
#[tauri::command(async)]
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

// Off the main thread: kill() joins the reader thread, which can block until the
// child's PTY closes — never do that on the GUI thread.
#[tauri::command(async)]
fn pty_kill(registry: State<'_, SessionRegistry>, session_id: String) -> Result<(), PtyError> {
    registry.kill(&session_id)
}

// --- Agent bridge (segment 2: Rust ↔ Go sidecar) ---------------------------
// All async: each does blocking HTTP to the sidecar, which must never run on
// the GUI thread. Custom commands like these need no `capabilities` entries
// (only plugin/core permissions do), same as the PTY commands above.

#[tauri::command(async)]
fn agent_attach(
    app: AppHandle,
    bridge: State<'_, AgentBridge>,
    workdir: String,
) -> Result<String, AgentError> {
    bridge.attach(&app, workdir)
}

#[tauri::command(async)]
fn agent_forward_result(
    bridge: State<'_, AgentBridge>,
    session_id: String,
    tool_use_id: String,
    result: Value,
) -> Result<(), AgentError> {
    bridge.forward_result(&session_id, &tool_use_id, result)
}

#[tauri::command(async)]
fn agent_publish_catalog(
    bridge: State<'_, AgentBridge>,
    session_id: String,
    catalog: Value,
) -> Result<(), AgentError> {
    bridge.publish_catalog(&session_id, catalog)
}

#[tauri::command(async)]
fn agent_detach(bridge: State<'_, AgentBridge>, session_id: String) {
    bridge.detach(&session_id);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(SessionRegistry::default())
        .manage(AgentBridge::default())
        .invoke_handler(tauri::generate_handler![
            app_info,
            greet,
            pty_spawn,
            pty_write,
            pty_resize,
            pty_kill,
            agent_attach,
            agent_forward_result,
            agent_publish_catalog,
            agent_detach
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app_handle, event| {
            // Kill every live PTY child when the app exits or its window is
            // destroyed, even if no renderer unmount fired (design D10).
            if let RunEvent::Exit = event {
                app_handle.state::<SessionRegistry>().kill_all();
                app_handle.state::<AgentBridge>().shutdown();
            } else if let RunEvent::WindowEvent {
                event: tauri::WindowEvent::Destroyed,
                ..
            } = event
            {
                app_handle.state::<SessionRegistry>().kill_all();
                app_handle.state::<AgentBridge>().shutdown();
            }
        });
}
