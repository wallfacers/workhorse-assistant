//! Runtime-agnostic supervisor core (add-native-runtime-mode).
//!
//! Pure decision functions + state enums shared by the Native and WSL backends.
//! No IO — unit-tested here. The "No-leak invariant" lives in the gates these
//! functions encode; the per-backend IO shells (`native.rs`, `wsl.rs`) supply
//! the side effects.

use std::time::Duration;

use serde::Serialize;

pub const BACKOFF_BASE_MS: u64 = 1_000;
pub const BACKOFF_MAX_MS: u64 = 30_000;
/// Consecutive failures after which we stop restarting and enter `Failed`.
pub const RESTART_CAP: u32 = 5;
/// How long to wait for a freshly-spawned sidecar to start listening.
pub const START_GRACE: Duration = Duration::from_secs(30);
/// Poll interval while watching a running child / waiting for start.
pub const POLL_INTERVAL: Duration = Duration::from_millis(500);
/// Grace given to a graceful SIGTERM before escalating to SIGKILL.
pub const REAP_GRACE: Duration = Duration::from_secs(5);
/// Default loopback port used for port-owner discovery when a command override
/// omits `--port`.
pub const DEFAULT_PORT: u16 = 7821;

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
    /// Which runtime the supervisor is driving (`"native"` | `"wsl"`), for the
    /// UI's runtime indicator. Absent when `Disabled`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub runtime: Option<String>,
}

impl SupervisorStatus {
    pub fn new(state: SupervisorState) -> Self {
        Self { state, reason: None, runtime: None }
    }
    pub fn with_reason(state: SupervisorState, reason: impl Into<String>) -> Self {
        Self { state, reason: Some(reason.into()), runtime: None }
    }
    /// Tag the status with the driving runtime label.
    pub fn with_runtime(mut self, runtime: impl Into<String>) -> Self {
        self.runtime = Some(runtime.into());
        self
    }
}

impl Default for SupervisorStatus {
    fn default() -> Self {
        SupervisorStatus::new(SupervisorState::Disabled)
    }
}

/// Whether the supervisor is responsible for killing the sidecar on teardown.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Ownership {
    /// We spawned it — reap on exit / mode switch.
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

/// Build the serve command from a port and an optional override. Pure — the
/// WSL backend wraps it as `wsl.exe -d <distro> -- bash -lic 'exec <command>'`;
/// the Native backend splits it into argv for a direct `Command`.
pub fn build_serve_command(port: u16, serve_cmd_override: Option<&str>) -> String {
    match serve_cmd_override {
        Some(o) if !o.trim().is_empty() => o.trim().to_string(),
        _ => format!("workhorse-agent serve --host 127.0.0.1 --port {port}"),
    }
}

/// True if a process command line is a `workhorse-agent` (identity gate before
/// any kill). Pure — unit-tested.
pub fn is_workhorse(cmdline: &str) -> bool {
    cmdline.contains("workhorse-agent")
}

/// Config-priority distro reconciliation (unify-wsl-distro-source). Given the
/// distro the backend *expects* (the user's `RuntimeConfig`: `Some(name)` for
/// WSL, `None` for Native) and the distro the sidecar *actually* reports on
/// `/health` (`None` when it omits the field, i.e. not running under WSL),
/// returns whether the running sidecar's namespace matches the configured one.
/// A `false` means the running sidecar is in the wrong namespace and — since
/// config wins — must be reaped and respawned per config. Pure — unit-tested.
pub fn distro_aligned(expected: Option<&str>, actual: Option<&str>) -> bool {
    match (expected, actual) {
        (None, None) => true,         // Native configured, native sidecar — aligned
        (None, Some(_)) => false,     // Native configured, but a WSL sidecar answers
        (Some(_), None) => false,     // WSL configured, but sidecar reports no distro
        (Some(e), Some(a)) => e == a, // both WSL — aligned iff same registration name
    }
}

/// Extract the `--port` value from a built command (defaults to [`DEFAULT_PORT`]).
pub fn parse_port(command: &str) -> u16 {
    command
        .split_whitespace()
        .skip_while(|t| *t != "--port")
        .nth(1)
        .and_then(|p| p.parse().ok())
        .unwrap_or(DEFAULT_PORT)
}

/// Extract the loopback port from an endpoint URL (`http(s)://host[:port]`), the
/// single source of truth for the port a managed sidecar binds
/// (unify-runtime-source-panel). Falls back to [`DEFAULT_PORT`] when the endpoint
/// omits a port or is unparseable. Pure — unit-tested.
pub fn port_from_endpoint(endpoint: &str) -> u16 {
    let after_scheme = endpoint
        .trim()
        .strip_prefix("https://")
        .or_else(|| endpoint.trim().strip_prefix("http://"))
        .unwrap_or(endpoint.trim());
    // Authority ends at the first '/' (path), '?' (query) or '#' (fragment).
    let authority = after_scheme
        .split(['/', '?', '#'])
        .next()
        .unwrap_or(after_scheme);
    // IPv6 literals (`[::1]:7821`) keep the port after the closing bracket.
    let port_part = match authority.rsplit_once(']') {
        Some((_, rest)) => rest.strip_prefix(':'),
        None => authority.rsplit_once(':').map(|(_, p)| p),
    };
    port_part
        .and_then(|p| p.parse().ok())
        .unwrap_or(DEFAULT_PORT)
}

#[cfg(test)]
mod tests {
    use super::*;

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
            build_serve_command(7821, None),
            "workhorse-agent serve --host 127.0.0.1 --port 7821"
        );
        assert_eq!(
            build_serve_command(9000, None),
            "workhorse-agent serve --host 127.0.0.1 --port 9000"
        );
        assert_eq!(
            build_serve_command(7821, Some("/opt/wh serve --port 7821")),
            "/opt/wh serve --port 7821"
        );
        assert_eq!(
            build_serve_command(7821, Some("   ")),
            "workhorse-agent serve --host 127.0.0.1 --port 7821"
        );
    }

    #[test]
    fn distro_alignment_is_config_priority() {
        // Native configured (expected None): aligned only with a native sidecar.
        assert!(distro_aligned(None, None));
        assert!(!distro_aligned(None, Some("Ubuntu"))); // WSL sidecar under Native
        // WSL configured: aligned only with the same registration name.
        assert!(distro_aligned(Some("Ubuntu"), Some("Ubuntu")));
        assert!(!distro_aligned(Some("Ubuntu"), Some("Debian")));
        assert!(!distro_aligned(Some("Ubuntu"), None)); // sidecar omitted distro
    }

    #[test]
    fn identity_gate() {
        assert!(is_workhorse("/usr/local/bin/workhorse-agent serve --port 7821"));
        assert!(is_workhorse("C:\\Program Files\\wh\\workhorse-agent.exe serve"));
        assert!(!is_workhorse("/usr/sbin/nginx -g daemon off;"));
        assert!(!is_workhorse(""));
    }

    #[test]
    fn parse_port_reads_built_command() {
        assert_eq!(parse_port("workhorse-agent serve --host 127.0.0.1 --port 7821"), 7821);
        assert_eq!(parse_port("workhorse-agent serve --host 127.0.0.1 --port 9000"), 9000);
        assert_eq!(parse_port("/opt/wh serve"), 7821); // no --port → default
    }

    #[test]
    fn port_from_endpoint_extracts_or_defaults() {
        assert_eq!(port_from_endpoint("http://127.0.0.1:7821"), 7821);
        assert_eq!(port_from_endpoint("http://127.0.0.1:9000/"), 9000);
        assert_eq!(port_from_endpoint("https://example.com:8443/health"), 8443);
        assert_eq!(port_from_endpoint("http://localhost"), DEFAULT_PORT); // no port → default
        assert_eq!(port_from_endpoint("http://[::1]:7821"), 7821); // IPv6 literal
        assert_eq!(port_from_endpoint("http://[::1]"), DEFAULT_PORT); // IPv6, no port
        assert_eq!(port_from_endpoint("garbage"), DEFAULT_PORT); // unparseable → default
    }
}
