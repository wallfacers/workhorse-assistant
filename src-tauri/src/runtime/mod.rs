//! Runtime supervisor (add-native-runtime-mode).
//!
//! Owns the lifecycle of exactly one `workhorse-agent` sidecar, on one of two
//! interchangeable back-ends:
//!
//!   * [`native::NativeBackend`] — spawns the bundled host binary directly
//!     (default; the only sensible mode off-Windows).
//!   * [`wsl::WslBackend`] — spawns the binary inside a WSL distro via `wsl.exe`
//!     (Windows-only, opt-in).
//!
//! The runtime-agnostic decision core ([`core`]) implements the "No-leak
//! invariant" gates; each back-end supplies the IO (probe / spawn / capture pid /
//! reap). The monitor loop here is generic over [`Backend`], so the same
//! reconcile→spawn→watch→restart/reap state machine drives both.
//!
//! Runtime mutex: only one back-end runs at a time. Switching modes tears the
//! current one down (reaping only what we spawned) before driving the next, so a
//! stale sidecar can never keep answering the fixed port (the localhost-forward
//! cross-talk that motivated this change).

pub mod core;
pub mod native;
pub mod wsl;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter};

use crate::config::{RuntimeConfig, RuntimeKind};

pub use core::{SupervisorState, SupervisorStatus};
use core::{
    backoff_delay_ms, decide, distro_aligned, next_on_child_exit, ownership_for, AfterExit,
    Ownership, PortProbe, ReconcileAction, POLL_INTERVAL, REAP_GRACE, START_GRACE,
};

const STATUS_EVENT: &str = "supervisor://status";

/// A spawned sidecar handle plus the OS pid to reap, when already known. Native
/// spawns the process directly (pid known immediately); WSL spawns a `wsl.exe`
/// relay (pid is `None` here and discovered via [`Backend::capture_pid`] once
/// the in-distro process is listening).
pub struct Spawned {
    pub child: std::process::Child,
    pub pid: Option<u32>,
}

/// IO contract a runtime back-end supplies to the monitor. The decision logic is
/// in [`core`]; this is only side effects. Implementors own their endpoint /
/// port / target so the monitor stays runtime-agnostic.
pub trait Backend: Send + Sync {
    /// Stable label for status + logs (`"native"` | `"wsl"`).
    fn label(&self) -> &'static str;
    /// The health endpoint this back-end's sidecar listens on.
    fn endpoint(&self) -> &str;
    /// The distro this back-end's `RuntimeConfig` expects the sidecar to run in:
    /// `Some(name)` for WSL, `None` for Native. Compared against `/health.distro`
    /// to enforce config-priority on adoption (unify-wsl-distro-source).
    fn expected_distro(&self) -> Option<&str>;
    /// Gate-1 classification of whatever holds the port.
    fn probe(&self) -> PortProbe;
    /// Spawn the sidecar.
    fn spawn(&self) -> std::io::Result<Spawned>;
    /// Discover the OS pid owning the port (used when [`Spawned::pid`] is `None`).
    fn capture_pid(&self) -> Option<u32>;
    /// Reap an OS pid: SIGTERM, grace, then SIGKILL. Best-effort.
    fn reap(&self, pid: u32, grace: Duration);
}

/// `GET {endpoint}/health` → healthy compatible sidecar? Shared by both
/// back-ends' `probe` and by the monitor's start-convergence poll.
pub fn probe_healthy(endpoint: &str) -> bool {
    let url = format!("{}/health", endpoint.trim_end_matches('/'));
    match ureq::get(&url).timeout(Duration::from_secs(3)).call() {
        Ok(resp) => resp
            .into_json::<serde_json::Value>()
            .ok()
            // A degraded-but-reachable sidecar (ok:false, e.g. no_provider_key) is
            // still ours to adopt/supervise — it speaks our protocol. Gate on the
            // protocol version, not on `ok` (the renderer surfaces the degraded
            // reason from /health separately).
            .map(|v| v.get("protocol_version").and_then(|p| p.as_str()) == Some("1"))
            .unwrap_or(false),
        Err(_) => false,
    }
}

/// Read `/health` for the distro the sidecar reports running in, distinguishing
/// "unreachable" from "reachable but no distro" so the caller never mistakes a
/// transient probe failure for a namespace mismatch:
///   - `None`          → `/health` could not be read (transient).
///   - `Some(None)`    → reachable, no `distro` field (a native sidecar).
///   - `Some(Some(d))` → reachable, running in distro `d`.
fn health_distro_read(endpoint: &str) -> Option<Option<String>> {
    let url = format!("{}/health", endpoint.trim_end_matches('/'));
    let resp = ureq::get(&url).timeout(Duration::from_secs(3)).call().ok()?;
    let v: serde_json::Value = resp.into_json().ok()?;
    Some(v.get("distro").and_then(|d| d.as_str()).map(|s| s.to_string()))
}

/// Human-readable drift reason for `supervisor://status` (`native` stands in for
/// the absent-distro case on both sides).
fn drift_reason(expected: Option<&str>, actual: Option<&str>) -> String {
    format!(
        "runtime distro drift: configured={}, actual={}",
        expected.unwrap_or("native"),
        actual.unwrap_or("native"),
    )
}

/// Bound on config-priority reaps of an adopted-but-mismatched sidecar, so an
/// external sidecar that keeps reclaiming the port cannot loop the monitor.
const MAX_RECONCILE_REAPS: u32 = 3;

// --- Runtime state ----------------------------------------------------------

#[derive(Default)]
struct Inner {
    status: SupervisorStatus,
    ownership: Option<Ownership>,
    /// The OS pid we are responsible for (for synchronous reap on teardown).
    spawned_pid: Option<u32>,
    /// The active back-end, kept so teardown can reap by pid without the monitor.
    backend: Option<Arc<dyn Backend>>,
    /// Generation counter: bumped on every (re)drive so a stale monitor thread
    /// exits instead of fighting a newer one.
    generation: u64,
    /// Cooperative stop flag for the active monitor thread.
    stop: Arc<AtomicBool>,
}

/// Managed Tauri state. Drives at most one monitor thread (one back-end) at a time.
#[derive(Default)]
pub struct Supervisor {
    inner: Arc<Mutex<Inner>>,
}

impl Supervisor {
    pub fn status(&self) -> SupervisorStatus {
        self.inner.lock().unwrap().status.clone()
    }

    /// (Re)drive the supervisor from current config. Stops any running monitor,
    /// reaps a spawned sidecar (runtime mutex), then starts a fresh monitor on
    /// the selected back-end.
    pub fn drive(&self, app: &AppHandle, cfg: RuntimeConfig, endpoint: String) {
        // Runtime mutex: tear the current back-end down before driving the next,
        // so the fixed port is released and a stale sidecar cannot be adopted.
        // This runs for every mode, including Remote — switching to Remote still
        // reaps a previously-spawned local sidecar (it just starts nothing new).
        self.teardown_internal();

        // Remote (R2, unify-runtime-source-panel): the app hosts no process, so
        // the supervisor stays Disabled and the auto-connect probe owns liveness.
        // No spawn, no monitor thread, no port reconciliation.
        if !cfg.mode.is_managed() {
            self.set_status(
                app,
                SupervisorStatus::new(SupervisorState::Disabled).with_runtime("remote"),
            );
            return;
        }

        let backend: Arc<dyn Backend> = match cfg.mode {
            RuntimeKind::Native => Arc::new(native::NativeBackend::new(
                endpoint,
                cfg.serve_cmd_override.clone(),
                native::resolve_program(app),
            )),
            RuntimeKind::Remote => unreachable!("Remote handled above (unmanaged)"),
            RuntimeKind::Wsl => {
                if !cfg!(windows) {
                    self.set_status(
                        app,
                        SupervisorStatus::with_reason(
                            SupervisorState::Failed,
                            "WSL runtime requires a Windows host",
                        )
                        .with_runtime("wsl"),
                    );
                    return;
                }
                let distro = match cfg.distro.clone() {
                    Some(d) if !d.trim().is_empty() => d,
                    _ => {
                        self.set_status(
                            app,
                            SupervisorStatus::with_reason(
                                SupervisorState::Failed,
                                "WSL runtime selected but no distro chosen",
                            )
                            .with_runtime("wsl"),
                        );
                        return;
                    }
                };
                Arc::new(wsl::WslBackend::new(endpoint, distro, cfg.serve_cmd_override.clone()))
            }
        };

        let stop = Arc::new(AtomicBool::new(false));
        let generation = {
            let mut inner = self.inner.lock().unwrap();
            inner.generation += 1;
            inner.stop = stop.clone();
            inner.backend = Some(backend.clone());
            inner.generation
        };

        let inner = self.inner.clone();
        let app = app.clone();
        std::thread::spawn(move || {
            run_monitor(app, inner, stop, generation, backend);
        });
    }

    /// Reap a spawned sidecar and stop the monitor (app exit / mode switch).
    /// Adopted sidecars are left running.
    pub fn shutdown(&self) {
        self.teardown_internal();
    }

    fn teardown_internal(&self) {
        let (ownership, pid, backend) = {
            let inner = self.inner.lock().unwrap();
            inner.stop.store(true, Ordering::SeqCst);
            (inner.ownership, inner.spawned_pid, inner.backend.clone())
        };
        // Synchronous, authoritative reap of the process we own. The monitor
        // thread is only a best-effort secondary reaper.
        if matches!(ownership, Some(Ownership::Ours)) {
            if let (Some(pid), Some(backend)) = (pid, backend) {
                backend.reap(pid, REAP_GRACE);
            }
        }
        let mut inner = self.inner.lock().unwrap();
        inner.spawned_pid = None;
        inner.ownership = None;
        inner.backend = None;
    }

    fn set_status(&self, app: &AppHandle, status: SupervisorStatus) {
        self.inner.lock().unwrap().status = status.clone();
        let _ = app.emit(STATUS_EVENT, status);
    }
}

/// Emit + store a status from inside the monitor thread (no `&Supervisor`).
fn emit_status(
    app: &AppHandle,
    inner: &Arc<Mutex<Inner>>,
    backend: &Arc<dyn Backend>,
    status: SupervisorStatus,
) {
    let status = status.with_runtime(backend.label());
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
    backend: Arc<dyn Backend>,
) {
    let mut failure_count: u32 = 0;
    // Bounded config-priority reaps of an adopted-but-mismatched sidecar.
    let mut reconcile_reaps: u32 = 0;

    loop {
        if superseded(&inner, &stop, generation) {
            return;
        }
        emit_status(&app, &inner, &backend, SupervisorStatus::new(SupervisorState::Probing));

        let action = decide(backend.probe());
        // Record ownership implied by the action before acting on it, so teardown
        // reaps only what we spawn (Foreign → None → never reaped).
        if let Some(owner) = ownership_for(&action) {
            inner.lock().unwrap().ownership = Some(owner);
        }
        match action {
            ReconcileAction::Adopt => {
                // Config-priority (unify-wsl-distro-source): the adopted sidecar
                // must run in the configured namespace. If its `/health.distro`
                // disagrees with the backend's expected distro, RuntimeConfig
                // wins — reap the mismatched (but protocol-confirmed workhorse)
                // sidecar and respawn ours. Bounded by MAX_RECONCILE_REAPS so an
                // external sidecar that keeps reclaiming the port cannot loop.
                // Re-read the adopted sidecar's distro. `probe_healthy` just
                // confirmed it is reachable, so a failed GET here is transient
                // noise — retry briefly, and if `/health` stays unreachable, adopt
                // rather than reap a confirmed-healthy sidecar on a flaky probe (a
                // transient `None` previously forced a needless reap+respawn).
                let actual = match (0..3).find_map(|i| {
                    if i > 0 {
                        std::thread::sleep(Duration::from_millis(200));
                    }
                    health_distro_read(backend.endpoint())
                }) {
                    Some(distro) => distro,
                    None => {
                        emit_status(&app, &inner, &backend, SupervisorStatus::new(SupervisorState::Adopted));
                        return;
                    }
                };
                if distro_aligned(backend.expected_distro(), actual.as_deref()) {
                    emit_status(&app, &inner, &backend, SupervisorStatus::new(SupervisorState::Adopted));
                    return; // reachability is auto-connect's job; nothing to supervise.
                }
                let reason = drift_reason(backend.expected_distro(), actual.as_deref());
                reconcile_reaps += 1;
                if reconcile_reaps > MAX_RECONCILE_REAPS {
                    emit_status(
                        &app,
                        &inner,
                        &backend,
                        SupervisorStatus::with_reason(
                            SupervisorState::Failed,
                            format!("external sidecar keeps reclaiming the port ({reason})"),
                        ),
                    );
                    return;
                }
                emit_status(
                    &app,
                    &inner,
                    &backend,
                    SupervisorStatus::with_reason(
                        SupervisorState::Restarting,
                        format!("{reason}; restarting per config"),
                    ),
                );
                // The adopted process is a confirmed workhorse-agent on our port,
                // just in the wrong namespace — reap by discovered pid, then loop
                // to re-probe (now Free) and spawn ours. Ownership corrects itself
                // on the next iteration (Spawn → Ours).
                if let Some(pid) = backend.capture_pid() {
                    backend.reap(pid, REAP_GRACE);
                }
                continue;
            }
            ReconcileAction::FailForeign { occupant } => {
                emit_status(
                    &app,
                    &inner,
                    &backend,
                    SupervisorStatus::with_reason(
                        SupervisorState::Failed,
                        format!("port busy by a non-workhorse process: {occupant}"),
                    ),
                );
                return;
            }
            ReconcileAction::ReapThenSpawn { pid } => {
                backend.reap(pid, REAP_GRACE);
            }
            ReconcileAction::Spawn => {}
        }

        emit_status(&app, &inner, &backend, SupervisorStatus::new(SupervisorState::Starting));
        let spawned = match backend.spawn() {
            Ok(s) => s,
            Err(e) => {
                if !record_failure_or_giveup(&app, &inner, &backend, &stop, generation, &mut failure_count, format!("spawn failed: {e}")) {
                    return;
                }
                continue;
            }
        };
        let mut child = spawned.child;
        if let Some(pid) = spawned.pid {
            inner.lock().unwrap().spawned_pid = Some(pid);
        }

        match await_start(&inner, &stop, generation, &backend, &mut child) {
            StartOutcome::Healthy => {
                failure_count = 0;
                emit_status(&app, &inner, &backend, SupervisorStatus::new(SupervisorState::Healthy));
            }
            StartOutcome::Stopped => {
                reap_child(&mut child, &inner, &backend);
                return;
            }
            StartOutcome::FailedStart(reason) => {
                reap_child(&mut child, &inner, &backend);
                if !record_failure_or_giveup(&app, &inner, &backend, &stop, generation, &mut failure_count, reason) {
                    return;
                }
                continue;
            }
        }

        // Healthy: watch until the child exits or we are stopped.
        loop {
            if superseded(&inner, &stop, generation) {
                reap_child(&mut child, &inner, &backend);
                return;
            }
            match child.try_wait() {
                Ok(Some(_)) => break, // crashed
                Ok(None) => std::thread::sleep(POLL_INTERVAL),
                Err(_) => break,
            }
        }
        clear_spawned_pid(&inner);
        if !record_failure_or_giveup(&app, &inner, &backend, &stop, generation, &mut failure_count, "sidecar exited".into()) {
            return;
        }
    }
}

enum StartOutcome {
    Healthy,
    Stopped,
    FailedStart(String),
}

/// Read up to `max_bytes` from the child's stderr. Returns an empty string
/// when stderr is unavailable.
fn read_stderr_tail(child: &mut std::process::Child, max_bytes: usize) -> String {
    use std::io::Read;
    let Some(stderr) = child.stderr.take() else {
        return String::new();
    };
    let mut buf = Vec::with_capacity(max_bytes);
    let _ = stderr.take(max_bytes as u64).read_to_end(&mut buf);
    String::from_utf8_lossy(&buf).trim().to_string()
}

/// Poll for the sidecar to become healthy within [`START_GRACE`], capturing the
/// OS pid to reap. A child that exits during the window is a failed start.
fn await_start(
    inner: &Arc<Mutex<Inner>>,
    stop: &Arc<AtomicBool>,
    generation: u64,
    backend: &Arc<dyn Backend>,
    child: &mut std::process::Child,
) -> StartOutcome {
    let deadline = Instant::now() + START_GRACE;
    loop {
        if superseded(inner, stop, generation) {
            return StartOutcome::Stopped;
        }
        if let Ok(Some(status)) = child.try_wait() {
            let stderr_snippet = read_stderr_tail(child, 512);
            let exit_info = if status.success() {
                "exited with code 0".to_string()
            } else if let Some(code) = status.code() {
                format!("exited with code {code}")
            } else {
                "killed by signal".to_string()
            };
            let msg = if stderr_snippet.is_empty() {
                format!("sidecar {exit_info} during startup")
            } else {
                format!("sidecar {exit_info} during startup: {stderr_snippet}")
            };
            return StartOutcome::FailedStart(msg);
        }
        if probe_healthy(backend.endpoint()) {
            // Capture the reap pid: already known for native (set at spawn), else
            // discovered by port for the wsl relay.
            if inner.lock().unwrap().spawned_pid.is_none() {
                if let Some(pid) = backend.capture_pid() {
                    inner.lock().unwrap().spawned_pid = Some(pid);
                }
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
#[allow(clippy::too_many_arguments)]
fn record_failure_or_giveup(
    app: &AppHandle,
    inner: &Arc<Mutex<Inner>>,
    backend: &Arc<dyn Backend>,
    stop: &Arc<AtomicBool>,
    generation: u64,
    failure_count: &mut u32,
    reason: String,
) -> bool {
    *failure_count += 1;
    match next_on_child_exit(*failure_count) {
        AfterExit::GiveUp => {
            reap_owned(inner, backend);
            emit_status(
                app,
                inner,
                backend,
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
                backend,
                SupervisorStatus::with_reason(SupervisorState::Restarting, reason),
            );
            let delay_ms = delay_ms.max(backoff_delay_ms(0));
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

/// Kill the spawned child handle and reap the OS process we own.
fn reap_child(child: &mut std::process::Child, inner: &Arc<Mutex<Inner>>, backend: &Arc<dyn Backend>) {
    reap_owned(inner, backend);
    let _ = child.kill();
    let _ = child.wait();
}

/// Reap the OS pid recorded as ours (Gate 2), then clear it.
fn reap_owned(inner: &Arc<Mutex<Inner>>, backend: &Arc<dyn Backend>) {
    let pid = inner.lock().unwrap().spawned_pid.take();
    if let Some(pid) = pid {
        backend.reap(pid, REAP_GRACE);
    }
}

fn clear_spawned_pid(inner: &Arc<Mutex<Inner>>) {
    inner.lock().unwrap().spawned_pid = None;
}
