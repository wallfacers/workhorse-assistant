use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Manager, RunEvent, State};

mod agent;
mod config;
mod pty;
mod runtime;
mod wsl;

use agent::{AgentBridge, AgentError, HealthInfo};
use config::{ConfigStore, RuntimeConfig};
use runtime::{Supervisor, SupervisorStatus};
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

// Whether the assistant's *host* process runs on Windows. The renderer uses this
// to gate the `terminal`→`wsl` auto-promotion: `wsl.exe` only bridges into a
// distro from a Windows host, so off-Windows (incl. a build running inside WSL)
// the UI keeps a local shell. Authoritative backstop lives in `resolve_profile`
// (`#[cfg(not(windows))]`). add-wsl-remote D-WSL-7 / C5.
#[tauri::command]
fn host_is_windows() -> bool {
    cfg!(windows)
}

// Detect WSL availability for the managed-sidecar Settings UI. Off-Windows this
// reports `available:false` without ever invoking `wsl.exe`. `(async)` because on
// Windows it shells out to `wsl -l -q`.
#[tauri::command(async)]
fn wsl_detect() -> wsl::WslDetect {
    wsl::detect()
}

// Current runtime-mode settings (for the Settings UI).
#[tauri::command(async)]
fn get_runtime_config(store: State<'_, ConfigStore>) -> RuntimeConfig {
    store.runtime()
}

// Persist runtime-mode settings and (re)drive the supervisor. Switching modes
// reaps the current runtime's sidecar (runtime mutex) before starting the next.
// Failures in the drive are surfaced via the `supervisor://status` event, not
// this return.
#[tauri::command(async)]
fn set_runtime_config(
    app: AppHandle,
    store: State<'_, ConfigStore>,
    supervisor: State<'_, Supervisor>,
    bridge: State<'_, AgentBridge>,
    config: RuntimeConfig,
) {
    store.set_runtime(config.clone());
    supervisor.drive(&app, config, bridge.current_endpoint());
}

// One-shot supervisor status (live updates arrive on `supervisor://status`).
#[tauri::command]
fn supervisor_status(supervisor: State<'_, Supervisor>) -> SupervisorStatus {
    supervisor.status()
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
    workdir: Option<String>,
    distro: Option<String>,
) -> Result<String, PtyError> {
    registry.spawn(&app, &profile_id, cols, rows, workdir.as_deref(), distro.as_deref())
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
fn agent_open_session(app: AppHandle, bridge: State<'_, AgentBridge>, session_id: String) {
    bridge.open_session(&app, session_id);
}

#[tauri::command(async)]
fn agent_list_sessions(
    bridge: State<'_, AgentBridge>,
    workdir: String,
) -> Result<Value, AgentError> {
    bridge.list_sessions(&workdir)
}

#[tauri::command(async)]
fn agent_session_history(
    bridge: State<'_, AgentBridge>,
    session_id: String,
) -> Result<Value, AgentError> {
    bridge.session_history(&session_id)
}

#[tauri::command(async)]
fn agent_rename_session(
    bridge: State<'_, AgentBridge>,
    session_id: String,
    title: String,
) -> Result<Value, AgentError> {
    bridge.rename_session(&session_id, &title)
}

#[tauri::command(async)]
fn agent_delete_session(
    bridge: State<'_, AgentBridge>,
    session_id: String,
) -> Result<(), AgentError> {
    bridge.delete_session(&session_id)
}

#[tauri::command(async)]
fn agent_list_projects(bridge: State<'_, AgentBridge>) -> Result<Value, AgentError> {
    bridge.list_projects()
}

#[tauri::command(async)]
fn agent_fs_list(
    bridge: State<'_, AgentBridge>,
    path: Option<String>,
) -> Result<Value, AgentError> {
    bridge.fs_list(path.as_deref())
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

#[tauri::command(async)]
fn agent_health_check(bridge: State<'_, AgentBridge>) -> Result<HealthInfo, AgentError> {
    bridge.health_check()
}

#[tauri::command(async)]
fn agent_get_endpoint(bridge: State<'_, AgentBridge>) -> String {
    bridge.current_endpoint()
}

#[tauri::command(async)]
fn agent_set_endpoint(
    bridge: State<'_, AgentBridge>,
    store: State<'_, ConfigStore>,
    endpoint: String,
) -> Result<(), AgentError> {
    bridge.set_endpoint(endpoint)?;
    // Persist the normalized value the bridge actually stored (trailing slash
    // trimmed) so the endpoint survives a restart.
    store.set_endpoint(bridge.current_endpoint());
    Ok(())
}

#[tauri::command(async)]
fn agent_send_message(
    bridge: State<'_, AgentBridge>,
    session_id: String,
    content: String,
) -> Result<(), AgentError> {
    bridge.send_message(&session_id, &content)
}

#[tauri::command(async)]
fn agent_cancel(
    bridge: State<'_, AgentBridge>,
    session_id: String,
) -> Result<(), AgentError> {
    bridge.cancel(&session_id)
}

#[tauri::command(async)]
fn agent_permission_decision(
    bridge: State<'_, AgentBridge>,
    session_id: String,
    request_id: String,
    decision: String,
) -> Result<(), AgentError> {
    bridge.permission_decision(&session_id, &request_id, &decision)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(SessionRegistry::default())
        .manage(AgentBridge::default())
        .manage(Supervisor::default())
        .setup(|app| {
            // Load the persisted config and seed the bridge endpoint before any
            // command runs. Resolution order: env override → config → default.
            let store = ConfigStore::load_from(app.handle());
            let resolved = config::resolve_endpoint(
                std::env::var(config::ENDPOINT_ENV).ok().as_deref(),
                &store.endpoint(),
            );
            let _ = app.state::<AgentBridge>().set_endpoint(resolved.clone());
            let runtime_cfg = store.runtime();
            app.manage(store);
            // Drive the supervisor from persisted config: Native (default) spawns
            // the bundled host binary; Wsl spawns inside the chosen distro.
            app.state::<Supervisor>().drive(app.handle(), runtime_cfg, resolved);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_info,
            greet,
            host_is_windows,
            wsl_detect,
            get_runtime_config,
            set_runtime_config,
            supervisor_status,
            pty_spawn,
            pty_write,
            pty_resize,
            pty_kill,
            agent_attach,
            agent_open_session,
            agent_list_sessions,
            agent_session_history,
            agent_rename_session,
            agent_delete_session,
            agent_list_projects,
            agent_fs_list,
            agent_forward_result,
            agent_publish_catalog,
            agent_detach,
            agent_health_check,
            agent_get_endpoint,
            agent_set_endpoint,
            agent_send_message,
            agent_cancel,
            agent_permission_decision
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app_handle, event| {
            // Kill every live PTY child when the app exits or its window is
            // destroyed, even if no renderer unmount fired (design D10).
            if let RunEvent::Exit = event {
                app_handle.state::<SessionRegistry>().kill_all();
                app_handle.state::<AgentBridge>().shutdown();
                app_handle.state::<Supervisor>().shutdown();
            } else if let RunEvent::WindowEvent {
                event: tauri::WindowEvent::Destroyed,
                ..
            } = event
            {
                app_handle.state::<SessionRegistry>().kill_all();
                app_handle.state::<AgentBridge>().shutdown();
                app_handle.state::<Supervisor>().shutdown();
            }
        });
}
