//! WSL-managed sidecar supervisor (add-wsl-managed-sidecar, Group C).
//!
//! Owns the lifecycle of a `workhorse-agent` sidecar spawned inside a WSL distro
//! when managed mode is on. The design's "No-leak invariant" is implemented here
//! as three gates plus a fixed-port natural mutex:
//!
//!   Gate 1 — reconcile on boot/restart: adopt a healthy sidecar, reap our own
//!            remnant (cmdline identity check), refuse to kill a foreign process,
//!            or spawn into a free port.
//!   Gate 2 — reap by the in-distro PID (SIGTERM → SIGKILL), discovered by port,
//!            never via the `wsl.exe` relay (which does not reliably reap it).
//!   Gate 3 — teardown on app exit / toggle-off reaps only a process we spawned.
//!
//! The pure decision core (`decide`, `backoff_delay_ms`, `next_on_child_exit`,
//! `build_serve_command`, ownership) is unit-tested; the IO shell shells out to
//! `wsl.exe` and is exercised only on a Windows host (manual tasks E2–E7).

use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::config::WslConfig;

const STATUS_EVENT: &str = "supervisor://status";
const BACKOFF_BASE_MS: u64 = 1_000;
const BACKOFF_MAX_MS: u64 = 30_000;
/// Consecutive failures after which we stop restarting and enter `Failed`.
const RESTART_CAP: u32 = 5;
/// How long to wait for a freshly-spawned sidecar to start listening (also when
/// its in-distro PID becomes discoverable). Not user-facing convergence — that
/// stays with `agent-auto-connect`; this is the supervisor capturing the PID and
/// distinguishing a failed start from a slow one.
const START_GRACE: Duration = Duration::from_secs(30);
/// Poll interval while watching a running child / waiting for start.
const POLL_INTERVAL: Duration = Duration::from_millis(500);
/// Grace given to a graceful SIGTERM before escalating to SIGKILL.
const REAP_GRACE: Duration = Duration::from_secs(5);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SupervisorState {
    Disabled,
    Probing,
    Adopted,
    Starting,
    Healthy,
    Restarting,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SupervisorStatus {
    pub state: SupervisorState,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

impl SupervisorStatus {
    fn new(state: SupervisorState) -> Self {
        Self { state, reason: None }
    }
    fn with_reason(state: SupervisorState, reason: impl Into<String>) -> Self {
        Self { state, reason: Some(reason.into()) }
    }
}

/// Whether the supervisor is responsible for killing the sidecar on teardown.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Ownership {
    /// We spawned it — reap on exit / toggle-off.
    Ours,
    /// Pre-existing, adopted — never reaped by us.
    NotOurs,
}

/// What the boot/restart reconcile (Gate 1) found on the configured port.
#[derive(Debug, Clone, PartialEq)]
pub enum PortProbe {
    /// A compatible `workhorse-agent` sidecar is healthy on the endpoint.
    HealthySidecar,
    /// Port held by a process confirmed (by cmdline) to be a `workhorse-agent`
    /// but not healthy — a reclaimable remnant of ours.
    OurRemnant { pid: u32 },
    /// Port held by a process we cannot confirm is `workhorse-agent`.
    Foreign { occupant: String },
    /// Port is free.
    Free,
}

/// The action Gate 1 decides from a [`PortProbe`]. Pure — unit-tested.
#[derive(Debug, Clone, PartialEq)]
pub enum ReconcileAction {
    Adopt,
    ReapThenSpawn { pid: u32 },
    Spawn,
    FailForeign { occupant: String },
}

/// Gate 1 decision: never kills a process we cannot confirm is ours.
pub fn decide(probe: PortProbe) -> ReconcileAction {
    match probe {
        PortProbe::HealthySidecar => ReconcileAction::Adopt,
        PortProbe::OurRemnant { pid } => ReconcileAction::ReapThenSpawn { pid },
        PortProbe::Free => ReconcileAction::Spawn,
        PortProbe::Foreign { occupant } => ReconcileAction::FailForeign { occupant },
    }
}

/// Ownership implied by a reconcile action (`None` for the foreign-failure case,
/// which spawns nothing). Used to decide teardown reaping.
pub fn ownership_for(action: &ReconcileAction) -> Option<Ownership> {
    match action {
        ReconcileAction::Adopt => Some(Ownership::NotOurs),
        ReconcileAction::Spawn | ReconcileAction::ReapThenSpawn { .. } => Some(Ownership::Ours),
        ReconcileAction::FailForeign { .. } => None,
    }
}

/// Exponential backoff: 1s, 2s, 4s, 8s, 16s, then capped at 30s.
pub fn backoff_delay_ms(failure_count: u32) -> u64 {
    let factor = 1u64.checked_shl(failure_count.min(20)).unwrap_or(u64::MAX);
    BACKOFF_BASE_MS.saturating_mul(factor).min(BACKOFF_MAX_MS)
}

/// What to do after a spawned child exits. Pure — unit-tested.
#[derive(Debug, Clone, PartialEq)]
pub enum AfterExit {
    Restart { delay_ms: u64 },
    GiveUp,
}

pub fn next_on_child_exit(failure_count: u32) -> AfterExit {
    if failure_count >= RESTART_CAP {
        AfterExit::GiveUp
    } else {
        AfterExit::Restart { delay_ms: backoff_delay_ms(failure_count) }
    }
}

/// Build the in-distro command run after `exec `. Pure — unit-tested. The
/// caller wraps it as `wsl.exe -d <distro> -- bash -lic 'exec <command>'`.
pub fn build_serve_command(cfg: &WslConfig) -> String {
    match &cfg.serve_cmd_override {
        Some(o) if !o.trim().is_empty() => o.trim().to_string(),
        _ => format!("workhorse-agent serve --host 127.0.0.1 --port {}", cfg.port),
    }
}

/// True if a process command line is a `workhorse-agent` (identity gate before
/// any kill). Pure — unit-tested.
pub fn is_workhorse(cmdline: &str) -> bool {
    cmdline.contains("workhorse-agent")
}

// --- IO shell (Windows-only at runtime; compiles everywhere) ----------------

#[cfg(windows)]
const WSL_BIN: &str = "wsl.exe";
#[cfg(not(windows))]
const WSL_BIN: &str = "wsl";

/// `GET {endpoint}/health` → healthy compatible sidecar?
fn probe_healthy(endpoint: &str) -> bool {
    let url = format!("{}/health", endpoint.trim_end_matches('/'));
    match ureq::get(&url).timeout(Duration::from_secs(3)).call() {
        Ok(resp) => resp
            .into_json::<serde_json::Value>()
            .ok()
            .and_then(|v| {
                let ok = v.get("ok").and_then(|b| b.as_bool()).unwrap_or(false);
                let proto = v.get("protocol_version").and_then(|p| p.as_str()).unwrap_or("");
                Some(ok && proto == "1")
            })
            .unwrap_or(false),
        Err(_) => false,
    }
}

/// Discover the PID + cmdline of the process owning `port` inside `distro`.
fn discover_port_owner(distro: &str, port: u16) -> Option<(u32, String)> {
    // ss prints `pid=<n>`; read its cmdline (NUL-separated) and flatten to spaces.
    let script = format!(
        "pid=$(ss -ltnpH 'sport = :{port}' 2>/dev/null | grep -oP 'pid=\\K[0-9]+' | head -n1); \
         if [ -n \"$pid\" ]; then printf '%s\\t' \"$pid\"; tr '\\0' ' ' < /proc/$pid/cmdline; fi"
    );
    let out = Command::new(WSL_BIN)
        .args(["-d", distro, "--", "bash", "-lc", &script])
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&out.stdout);
    let (pid_str, cmdline) = text.split_once('\t')?;
    let pid: u32 = pid_str.trim().parse().ok()?;
    Some((pid, cmdline.trim().to_string()))
}

/// Reap an in-distro PID: SIGTERM, wait the grace window, then SIGKILL. Never
/// goes through the `wsl.exe` relay. Best-effort (errors are swallowed — the
/// next boot's Gate 1 reconcile is the backstop).
fn reap_pid(distro: &str, pid: u32, grace: Duration) {
    let secs = grace.as_secs().max(1);
    let script = format!(
        "kill -TERM {pid} 2>/dev/null; \
         for _ in $(seq 1 {secs}); do kill -0 {pid} 2>/dev/null || exit 0; sleep 1; done; \
         kill -KILL {pid} 2>/dev/null || true"
    );
    let _ = Command::new(WSL_BIN)
        .args(["-d", distro, "--", "bash", "-lc", &script])
        .output();
}

/// Spawn the relay: `wsl.exe -d <distro> -- bash -lic 'exec <command>'`. The
/// `exec` collapses the shell so the sidecar is the single relay-attached
/// process (no orphan parent).
fn spawn_relay(distro: &str, command: &str) -> std::io::Result<std::process::Child> {
    let inner = format!("exec {command}");
    Command::new(WSL_BIN)
        .args(["-d", distro, "--", "bash", "-lic", &inner])
        .spawn()
}

/// Full Gate-1 probe: healthy → adopt; else inspect the port owner.
fn probe_port(endpoint: &str, distro: &str, port: u16) -> PortProbe {
    if probe_healthy(endpoint) {
        return PortProbe::HealthySidecar;
    }
    match discover_port_owner(distro, port) {
        Some((pid, cmd)) if is_workhorse(&cmd) => PortProbe::OurRemnant { pid },
        Some((_, cmd)) => PortProbe::Foreign { occupant: cmd },
        None => PortProbe::Free,
    }
}

// --- Runtime state ----------------------------------------------------------

#[derive(Default)]
struct Inner {
    status: SupervisorStatus,
    ownership: Option<Ownership>,
    /// The in-distro PID we are responsible for (for synchronous reap on exit).
    spawned_pid: Option<u32>,
    distro: Option<String>,
    /// Generation counter: bumped on every (re)drive so a stale monitor thread
    /// exits instead of fighting a newer one.
    generation: u64,
    /// Cooperative stop flag for the active monitor thread. Replaced on each
    /// (re)drive; the monitor holds its own clone.
    stop: Arc<AtomicBool>,
}

impl Default for SupervisorStatus {
    fn default() -> Self {
        SupervisorStatus::new(SupervisorState::Disabled)
    }
}

/// Managed Tauri state. Drives at most one monitor thread at a time.
#[derive(Default)]
pub struct Supervisor {
    inner: Arc<Mutex<Inner>>,
}

impl Supervisor {
    pub fn status(&self) -> SupervisorStatus {
        self.inner.lock().unwrap().status.clone()
    }

    /// (Re)drive the supervisor from current config. Stops any running monitor,
    /// reaps a spawned sidecar, then — if managed and on Windows — starts a fresh
    /// monitor. Off-Windows or managed-off ⇒ `Disabled`.
    pub fn drive(&self, app: &AppHandle, cfg: WslConfig, endpoint: String) {
        // Stop the previous monitor and reap what we own before re-driving.
        self.teardown_internal();

        if !cfg!(windows) || !cfg.managed {
            self.set_status(app, SupervisorStatus::new(SupervisorState::Disabled));
            return;
        }
        let distro = match cfg.distro.clone() {
            Some(d) if !d.trim().is_empty() => d,
            _ => {
                self.set_status(
                    app,
                    SupervisorStatus::with_reason(
                        SupervisorState::Failed,
                        "managed mode on but no distro selected",
                    ),
                );
                return;
            }
        };

        let stop = Arc::new(AtomicBool::new(false));
        let generation = {
            let mut inner = self.inner.lock().unwrap();
            inner.generation += 1;
            inner.distro = Some(distro.clone());
            inner.stop = stop.clone();
            inner.generation
        };

        let inner = self.inner.clone();
        let app = app.clone();
        let command = build_serve_command(&cfg);
        std::thread::spawn(move || {
            run_monitor(app, inner, stop, generation, endpoint, distro, command);
        });
    }

    /// Reap a spawned sidecar and stop the monitor (app exit — Gate 3). Adopted
    /// sidecars are left running.
    pub fn shutdown(&self) {
        self.teardown_internal();
    }

    fn teardown_internal(&self) {
        let (ownership, pid, distro) = {
            let inner = self.inner.lock().unwrap();
            inner.stop.store(true, Ordering::SeqCst);
            (inner.ownership, inner.spawned_pid, inner.distro.clone())
        };
        // Synchronous, authoritative reap of the in-distro process we own. The
        // monitor thread (which may not get scheduled during app exit) is only a
        // best-effort secondary reaper.
        if matches!(ownership, Some(Ownership::Ours)) {
            if let (Some(pid), Some(distro)) = (pid, distro) {
                reap_pid(&distro, pid, REAP_GRACE);
            }
        }
        let mut inner = self.inner.lock().unwrap();
        inner.spawned_pid = None;
        inner.ownership = None;
    }

    fn set_status(&self, app: &AppHandle, status: SupervisorStatus) {
        self.inner.lock().unwrap().status = status.clone();
        let _ = app.emit(STATUS_EVENT, status);
    }
}

/// Emit + store a status from inside the monitor thread (no `&Supervisor`).
fn emit_status(app: &AppHandle, inner: &Arc<Mutex<Inner>>, status: SupervisorStatus) {
    inner.lock().unwrap().status = status.clone();
    let _ = app.emit(STATUS_EVENT, status);
}

/// True if this monitor has been superseded (newer generation) or asked to stop.
fn superseded(inner: &Arc<Mutex<Inner>>, stop: &Arc<AtomicBool>, generation: u64) -> bool {
    stop.load(Ordering::SeqCst) || inner.lock().unwrap().generation != generation
}

/// The monitor loop: reconcile → adopt/spawn → watch → restart/reap, until
/// stopped, superseded, adopted, or `Failed`.
fn run_monitor(
    app: AppHandle,
    inner: Arc<Mutex<Inner>>,
    stop: Arc<AtomicBool>,
    generation: u64,
    endpoint: String,
    distro: String,
    command: String,
) {
    let mut failure_count: u32 = 0;

    loop {
        if superseded(&inner, &stop, generation) {
            return;
        }
        emit_status(&app, &inner, SupervisorStatus::new(SupervisorState::Probing));

        match decide(probe_port(&endpoint, &distro, cfg_port(&command))) {
            ReconcileAction::Adopt => {
                inner.lock().unwrap().ownership = Some(Ownership::NotOurs);
                emit_status(&app, &inner, SupervisorStatus::new(SupervisorState::Adopted));
                return; // reachability is auto-connect's job; nothing to supervise.
            }
            ReconcileAction::FailForeign { occupant } => {
                emit_status(
                    &app,
                    &inner,
                    SupervisorStatus::with_reason(
                        SupervisorState::Failed,
                        format!("port busy by a non-workhorse process: {occupant}"),
                    ),
                );
                return;
            }
            ReconcileAction::ReapThenSpawn { pid } => {
                reap_pid(&distro, pid, REAP_GRACE);
            }
            ReconcileAction::Spawn => {}
        }

        // Spawn the relay.
        inner.lock().unwrap().ownership = Some(Ownership::Ours);
        emit_status(&app, &inner, SupervisorStatus::new(SupervisorState::Starting));
        let mut child = match spawn_relay(&distro, &command) {
            Ok(c) => c,
            Err(e) => {
                if !record_failure_or_giveup(&app, &inner, &stop, generation, &mut failure_count, &distro, format!("spawn failed: {e}")) {
                    return;
                }
                continue;
            }
        };

        // Wait for the sidecar to start listening; capture its in-distro PID.
        match await_start(&app, &inner, &stop, generation, &endpoint, &distro, cfg_port(&command), &mut child) {
            StartOutcome::Healthy => {
                failure_count = 0;
                emit_status(&app, &inner, SupervisorStatus::new(SupervisorState::Healthy));
            }
            StartOutcome::Stopped => {
                reap_child(&mut child, &inner, &distro);
                return;
            }
            StartOutcome::FailedStart(reason) => {
                reap_child(&mut child, &inner, &distro);
                if !record_failure_or_giveup(&app, &inner, &stop, generation, &mut failure_count, &distro, reason) {
                    return;
                }
                continue;
            }
        }

        // Healthy: watch until the child exits or we are stopped.
        loop {
            if superseded(&inner, &stop, generation) {
                reap_child(&mut child, &inner, &distro);
                return;
            }
            match child.try_wait() {
                Ok(Some(_)) => break, // crashed
                Ok(None) => std::thread::sleep(POLL_INTERVAL),
                Err(_) => break,
            }
        }
        // Child exited unexpectedly.
        clear_spawned_pid(&inner);
        if !record_failure_or_giveup(&app, &inner, &stop, generation, &mut failure_count, &distro, "sidecar exited".into()) {
            return;
        }
        // loop back → Gate 1 reconcile (reclaims any hung remnant) → respawn.
    }
}

enum StartOutcome {
    Healthy,
    Stopped,
    FailedStart(String),
}

/// Poll for the sidecar to become healthy within [`START_GRACE`], capturing its
/// in-distro PID. A child that exits during the window is a failed start.
fn await_start(
    app: &AppHandle,
    inner: &Arc<Mutex<Inner>>,
    stop: &Arc<AtomicBool>,
    generation: u64,
    endpoint: &str,
    distro: &str,
    port: u16,
    child: &mut std::process::Child,
) -> StartOutcome {
    let _ = app;
    let deadline = Instant::now() + START_GRACE;
    loop {
        if superseded(inner, stop, generation) {
            return StartOutcome::Stopped;
        }
        if let Ok(Some(_)) = child.try_wait() {
            return StartOutcome::FailedStart("sidecar exited during startup".into());
        }
        if probe_healthy(endpoint) {
            if let Some((pid, _)) = discover_port_owner(distro, port) {
                inner.lock().unwrap().spawned_pid = Some(pid);
            }
            return StartOutcome::Healthy;
        }
        if Instant::now() >= deadline {
            return StartOutcome::FailedStart("sidecar did not start listening in time".into());
        }
        std::thread::sleep(POLL_INTERVAL);
    }
}

/// Record a failure; emit `Restarting` and sleep the backoff, or reap + `Failed`
/// at the cap. Returns `true` to continue the monitor loop, `false` to stop.
fn record_failure_or_giveup(
    app: &AppHandle,
    inner: &Arc<Mutex<Inner>>,
    stop: &Arc<AtomicBool>,
    generation: u64,
    failure_count: &mut u32,
    distro: &str,
    reason: String,
) -> bool {
    *failure_count += 1;
    match next_on_child_exit(*failure_count) {
        AfterExit::GiveUp => {
            // No-leak: reap any surviving spawned process before the terminal state.
            reap_owned(inner, distro);
            emit_status(
                app,
                inner,
                SupervisorStatus::with_reason(
                    SupervisorState::Failed,
                    format!("giving up after {} attempts: {reason}", *failure_count),
                ),
            );
            false
        }
        AfterExit::Restart { delay_ms } => {
            emit_status(
                app,
                inner,
                SupervisorStatus::with_reason(SupervisorState::Restarting, reason),
            );
            // Sleep the backoff, but wake early if stopped/superseded.
            let deadline = Instant::now() + Duration::from_millis(delay_ms);
            while Instant::now() < deadline {
                if superseded(inner, stop, generation) {
                    return false;
                }
                std::thread::sleep(POLL_INTERVAL.min(Duration::from_millis(delay_ms)));
            }
            true
        }
    }
}

/// Kill the relay child handle and reap the in-distro process we own.
fn reap_child(child: &mut std::process::Child, inner: &Arc<Mutex<Inner>>, distro: &str) {
    reap_owned(inner, distro);
    let _ = child.kill();
    let _ = child.wait();
}

/// Reap the in-distro PID recorded as ours (Gate 2), then clear it.
fn reap_owned(inner: &Arc<Mutex<Inner>>, distro: &str) {
    let pid = inner.lock().unwrap().spawned_pid.take();
    if let Some(pid) = pid {
        reap_pid(distro, pid, REAP_GRACE);
    }
}

fn clear_spawned_pid(inner: &Arc<Mutex<Inner>>) {
    inner.lock().unwrap().spawned_pid = None;
}

/// Extract the `--port` value from the built command (defaults to 7821). Kept
/// simple: the command is one we built, so the flag is present in the default
/// case; an override without `--port` falls back to 7821 for discovery, which is
/// the documented convention.
fn cfg_port(command: &str) -> u16 {
    command
        .split_whitespace()
        .skip_while(|t| *t != "--port")
        .nth(1)
        .and_then(|p| p.parse().ok())
        .unwrap_or(7821)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cfg(port: u16, override_cmd: Option<&str>) -> WslConfig {
        WslConfig {
            managed: true,
            distro: Some("Ubuntu".into()),
            serve_cmd_override: override_cmd.map(str::to_string),
            port,
        }
    }

    #[test]
    fn decide_covers_all_branches() {
        assert_eq!(decide(PortProbe::HealthySidecar), ReconcileAction::Adopt);
        assert_eq!(decide(PortProbe::Free), ReconcileAction::Spawn);
        assert_eq!(
            decide(PortProbe::OurRemnant { pid: 42 }),
            ReconcileAction::ReapThenSpawn { pid: 42 }
        );
        assert_eq!(
            decide(PortProbe::Foreign { occupant: "nginx".into() }),
            ReconcileAction::FailForeign { occupant: "nginx".into() }
        );
    }

    #[test]
    fn foreign_process_is_never_reaped() {
        // The decision for a foreign occupant must not produce any kill/spawn.
        let action = decide(PortProbe::Foreign { occupant: "redis-server".into() });
        assert!(matches!(action, ReconcileAction::FailForeign { .. }));
        assert_eq!(ownership_for(&action), None);
    }

    #[test]
    fn ownership_reaps_spawned_not_adopted() {
        assert_eq!(ownership_for(&ReconcileAction::Adopt), Some(Ownership::NotOurs));
        assert_eq!(ownership_for(&ReconcileAction::Spawn), Some(Ownership::Ours));
        assert_eq!(
            ownership_for(&ReconcileAction::ReapThenSpawn { pid: 1 }),
            Some(Ownership::Ours)
        );
    }

    #[test]
    fn backoff_grows_then_caps() {
        assert_eq!(backoff_delay_ms(0), 1_000);
        assert_eq!(backoff_delay_ms(1), 2_000);
        assert_eq!(backoff_delay_ms(2), 4_000);
        assert_eq!(backoff_delay_ms(4), 16_000);
        assert_eq!(backoff_delay_ms(5), 30_000); // 32s capped to 30s
        assert_eq!(backoff_delay_ms(100), 30_000); // no overflow
    }

    #[test]
    fn restart_until_cap_then_give_up() {
        for fc in 1..RESTART_CAP {
            assert!(matches!(next_on_child_exit(fc), AfterExit::Restart { .. }));
        }
        assert_eq!(next_on_child_exit(RESTART_CAP), AfterExit::GiveUp);
        assert_eq!(next_on_child_exit(RESTART_CAP + 3), AfterExit::GiveUp);
    }

    #[test]
    fn serve_command_default_and_override() {
        assert_eq!(
            build_serve_command(&cfg(7821, None)),
            "workhorse-agent serve --host 127.0.0.1 --port 7821"
        );
        assert_eq!(
            build_serve_command(&cfg(9000, None)),
            "workhorse-agent serve --host 127.0.0.1 --port 9000"
        );
        assert_eq!(
            build_serve_command(&cfg(7821, Some("/opt/wh serve --port 7821"))),
            "/opt/wh serve --port 7821"
        );
        // Blank override falls back to the convention default.
        assert_eq!(
            build_serve_command(&cfg(7821, Some("   "))),
            "workhorse-agent serve --host 127.0.0.1 --port 7821"
        );
    }

    #[test]
    fn identity_gate() {
        assert!(is_workhorse("/usr/local/bin/workhorse-agent serve --port 7821"));
        assert!(!is_workhorse("/usr/sbin/nginx -g daemon off;"));
        assert!(!is_workhorse(""));
    }

    #[test]
    fn cfg_port_parses_built_command() {
        assert_eq!(cfg_port("workhorse-agent serve --host 127.0.0.1 --port 7821"), 7821);
        assert_eq!(cfg_port("workhorse-agent serve --host 127.0.0.1 --port 9000"), 9000);
        assert_eq!(cfg_port("/opt/wh serve"), 7821); // no --port → default
    }
}
