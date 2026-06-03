//! WSL runtime back-end (add-native-runtime-mode, formerly the standalone
//! managed-sidecar supervisor). Spawns `workhorse-agent` inside a distro via
//! `wsl.exe` and reaps it by its in-distro PID — never via the relay, which does
//! not reliably reap the exec'd child.

use std::process::Command;
use std::time::Duration;

use super::core::{build_serve_command, is_workhorse, parse_port, port_from_endpoint, PortProbe};
use super::{probe_healthy, Backend, Spawned};

#[cfg(windows)]
const WSL_BIN: &str = "wsl.exe";
#[cfg(not(windows))]
const WSL_BIN: &str = "wsl";

pub struct WslBackend {
    endpoint: String,
    distro: String,
    /// The command run after `exec ` inside the distro.
    command: String,
    /// Port the sidecar binds (for in-distro owner discovery).
    port: u16,
}

impl WslBackend {
    /// Port convergence (unify-runtime-source-panel): the default serve command's
    /// port is derived from `endpoint`; an advanced override is used verbatim and
    /// its own `--port` re-parsed for in-distro owner discovery.
    pub fn new(endpoint: String, distro: String, serve_cmd_override: Option<String>) -> Self {
        let command = build_serve_command(port_from_endpoint(&endpoint), serve_cmd_override.as_deref());
        let port = parse_port(&command);
        Self { endpoint, distro, command, port }
    }

    /// Discover the PID + cmdline of the process owning the port inside the distro.
    fn discover_port_owner(&self) -> Option<(u32, String)> {
        let port = self.port;
        let script = format!(
            "pid=$(ss -ltnpH 'sport = :{port}' 2>/dev/null | grep -oP 'pid=\\K[0-9]+' | head -n1); \
             if [ -n \"$pid\" ]; then printf '%s\\t' \"$pid\"; tr '\\0' ' ' < /proc/$pid/cmdline; fi"
        );
        let out = Command::new(WSL_BIN)
            .args(["-d", &self.distro, "--", "bash", "-lc", &script])
            .output()
            .ok()?;
        let text = String::from_utf8_lossy(&out.stdout);
        let (pid_str, cmdline) = text.split_once('\t')?;
        let pid: u32 = pid_str.trim().parse().ok()?;
        Some((pid, cmdline.trim().to_string()))
    }
}

impl Backend for WslBackend {
    fn label(&self) -> &'static str {
        "wsl"
    }

    fn endpoint(&self) -> &str {
        &self.endpoint
    }

    fn expected_distro(&self) -> Option<&str> {
        // The configured distro (registration name) the sidecar must report.
        Some(&self.distro)
    }

    fn probe(&self) -> PortProbe {
        if probe_healthy(&self.endpoint) {
            return PortProbe::HealthySidecar;
        }
        match self.discover_port_owner() {
            Some((pid, cmd)) if is_workhorse(&cmd) => PortProbe::OurRemnant { pid },
            Some((_, cmd)) => PortProbe::Foreign { occupant: cmd },
            None => PortProbe::Free,
        }
    }

    fn spawn(&self) -> std::io::Result<Spawned> {
        // `exec` collapses the login shell so the sidecar is the single
        // relay-attached process (no orphan parent). The real in-distro PID is
        // discovered later via `capture_pid` (the spawned Child is the relay).
        let inner = format!("exec {}", self.command);
        let child = Command::new(WSL_BIN)
            .args(["-d", &self.distro, "--", "bash", "-lic", &inner])
            .spawn()?;
        Ok(Spawned { child, pid: None })
    }

    fn capture_pid(&self) -> Option<u32> {
        self.discover_port_owner().map(|(pid, _)| pid)
    }

    fn reap(&self, pid: u32, grace: Duration) {
        let secs = grace.as_secs().max(1);
        let script = format!(
            "kill -TERM {pid} 2>/dev/null; \
             for _ in $(seq 1 {secs}); do kill -0 {pid} 2>/dev/null || exit 0; sleep 1; done; \
             kill -KILL {pid} 2>/dev/null || true"
        );
        let _ = Command::new(WSL_BIN)
            .args(["-d", &self.distro, "--", "bash", "-lc", &script])
            .output();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_derives_command_port_from_endpoint() {
        let b = WslBackend::new("http://127.0.0.1:9000".into(), "Ubuntu".into(), None);
        assert_eq!(b.command, "workhorse-agent serve --host 127.0.0.1 --port 9000");
        assert_eq!(b.port, 9000);
        assert_eq!(b.label(), "wsl");
    }

    #[test]
    fn override_command_is_used_verbatim() {
        let b = WslBackend::new(
            "http://127.0.0.1:7821".into(),
            "Ubuntu".into(),
            Some("/opt/wh serve --port 8000".into()),
        );
        assert_eq!(b.command, "/opt/wh serve --port 8000");
        // Port is re-parsed from the override for owner discovery.
        assert_eq!(b.port, 8000);
    }
}
