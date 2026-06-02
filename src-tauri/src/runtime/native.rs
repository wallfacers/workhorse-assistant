//! Native runtime back-end (add-native-runtime-mode). Spawns the bundled
//! `workhorse-agent` host binary directly — no `wsl.exe` relay — so the spawned
//! `Child`'s pid IS the sidecar pid (reaped directly). Default on every host and
//! the only sensible mode off-Windows.

use std::process::Command;
use std::time::{Duration, Instant};

use tauri::AppHandle;

use super::core::{is_workhorse, parse_port, PortProbe};
use super::{probe_healthy, Backend, Spawned};

/// Resolve the `workhorse-agent` program to spawn. Prefers the bundled sidecar
/// sitting next to the app executable (Tauri `externalBin`); falls back to the
/// binary on `PATH` (dev runs / unbundled).
pub fn resolve_program(_app: &AppHandle) -> String {
    let name = if cfg!(windows) { "workhorse-agent.exe" } else { "workhorse-agent" };
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let candidate = dir.join(name);
            if candidate.exists() {
                return candidate.to_string_lossy().into_owned();
            }
        }
    }
    "workhorse-agent".to_string()
}

pub struct NativeBackend {
    endpoint: String,
    program: String,
    args: Vec<String>,
    port: u16,
}

impl NativeBackend {
    pub fn new(
        endpoint: String,
        port: u16,
        serve_cmd_override: Option<String>,
        default_program: String,
    ) -> Self {
        match serve_cmd_override {
            Some(o) if !o.trim().is_empty() => {
                let toks: Vec<String> = o.split_whitespace().map(String::from).collect();
                let program = toks[0].clone();
                let args = toks[1..].to_vec();
                let port = parse_port(&o);
                Self { endpoint, program, args, port }
            }
            _ => {
                let args = vec![
                    "serve".into(),
                    "--host".into(),
                    "127.0.0.1".into(),
                    "--port".into(),
                    port.to_string(),
                ];
                Self { endpoint, program: default_program, args, port }
            }
        }
    }
}

impl Backend for NativeBackend {
    fn label(&self) -> &'static str {
        "native"
    }

    fn endpoint(&self) -> &str {
        &self.endpoint
    }

    fn probe(&self) -> PortProbe {
        if probe_healthy(&self.endpoint) {
            return PortProbe::HealthySidecar;
        }
        match discover_host_port_owner(self.port) {
            Some((pid, cmd)) if is_workhorse(&cmd) => PortProbe::OurRemnant { pid },
            Some((_, cmd)) => PortProbe::Foreign { occupant: cmd },
            None => PortProbe::Free,
        }
    }

    fn spawn(&self) -> std::io::Result<Spawned> {
        let child = Command::new(&self.program).args(&self.args).spawn()?;
        let pid = child.id();
        Ok(Spawned { child, pid: Some(pid) })
    }

    fn capture_pid(&self) -> Option<u32> {
        // Native spawn already knows its pid (returned from `spawn`); this is a
        // fallback for the discovery path only.
        discover_host_port_owner(self.port).map(|(pid, _)| pid)
    }

    fn reap(&self, pid: u32, grace: Duration) {
        reap_host(pid, grace);
    }
}

/// SIGTERM → grace → SIGKILL on the host, dependency-free (shells out to the
/// platform's process tools). Best-effort.
fn reap_host(pid: u32, grace: Duration) {
    #[cfg(unix)]
    {
        let _ = Command::new("kill").arg("-TERM").arg(pid.to_string()).status();
        let deadline = Instant::now() + grace;
        while Instant::now() < deadline {
            let alive = Command::new("kill")
                .arg("-0")
                .arg(pid.to_string())
                .status()
                .map(|s| s.success())
                .unwrap_or(false);
            if !alive {
                return;
            }
            std::thread::sleep(Duration::from_millis(200));
        }
        let _ = Command::new("kill").arg("-KILL").arg(pid.to_string()).status();
    }
    #[cfg(windows)]
    {
        let _ = Command::new("taskkill").args(["/PID", &pid.to_string()]).status();
        std::thread::sleep(grace.min(Duration::from_secs(2)));
        let _ = Command::new("taskkill").args(["/PID", &pid.to_string(), "/T", "/F"]).status();
    }
    #[cfg(not(any(unix, windows)))]
    {
        let _ = (pid, grace);
    }
}

/// Discover the pid + cmdline of the host process listening on `port`. Per-OS;
/// returns `None` when discovery is unavailable (treated as "port free", so the
/// next spawn either binds or fails fast on an in-use port).
#[cfg(target_os = "linux")]
fn discover_host_port_owner(port: u16) -> Option<(u32, String)> {
    let out = Command::new("ss")
        .args(["-ltnpH", &format!("sport = :{port}")])
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&out.stdout);
    let pid: u32 = text
        .split("pid=")
        .nth(1)?
        .split(|c: char| !c.is_ascii_digit())
        .next()?
        .parse()
        .ok()?;
    let cmdline = std::fs::read(format!("/proc/{pid}/cmdline"))
        .ok()
        .map(|b| String::from_utf8_lossy(&b).replace('\0', " ").trim().to_string())
        .unwrap_or_default();
    Some((pid, cmdline))
}

#[cfg(target_os = "macos")]
fn discover_host_port_owner(port: u16) -> Option<(u32, String)> {
    let out = Command::new("lsof")
        .args(["-nP", &format!("-iTCP:{port}"), "-sTCP:LISTEN", "-t"])
        .output()
        .ok()?;
    let pid: u32 = String::from_utf8_lossy(&out.stdout).lines().next()?.trim().parse().ok()?;
    let ps = Command::new("ps")
        .args(["-o", "command=", "-p", &pid.to_string()])
        .output()
        .ok()?;
    let cmd = String::from_utf8_lossy(&ps.stdout).trim().to_string();
    Some((pid, cmd))
}

#[cfg(windows)]
fn discover_host_port_owner(port: u16) -> Option<(u32, String)> {
    let out = Command::new("netstat").args(["-ano", "-p", "tcp"]).output().ok()?;
    let text = String::from_utf8_lossy(&out.stdout);
    let needle = format!(":{port}");
    let pid: u32 = text
        .lines()
        .filter(|l| l.contains("LISTENING") && l.contains(&needle))
        .filter_map(|l| l.split_whitespace().last())
        .filter_map(|p| p.parse::<u32>().ok())
        .next()?;
    let tl = Command::new("tasklist")
        .args(["/FI", &format!("PID eq {pid}"), "/FO", "CSV", "/NH"])
        .output()
        .ok()?;
    let img = String::from_utf8_lossy(&tl.stdout)
        .trim()
        .split(',')
        .next()
        .map(|s| s.trim_matches('"').to_string())
        .unwrap_or_default();
    Some((pid, img))
}

#[cfg(not(any(target_os = "linux", target_os = "macos", windows)))]
fn discover_host_port_owner(_port: u16) -> Option<(u32, String)> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_command_builds_serve_args() {
        let b = NativeBackend::new(
            "http://127.0.0.1:7821".into(),
            7821,
            None,
            "/opt/app/workhorse-agent".into(),
        );
        assert_eq!(b.program, "/opt/app/workhorse-agent");
        assert_eq!(b.args, vec!["serve", "--host", "127.0.0.1", "--port", "7821"]);
        assert_eq!(b.port, 7821);
        assert_eq!(b.label(), "native");
    }

    #[test]
    fn override_splits_into_program_and_args() {
        let b = NativeBackend::new(
            "http://127.0.0.1:8000".into(),
            7821,
            Some("/usr/bin/wh serve --port 8000".into()),
            "ignored".into(),
        );
        assert_eq!(b.program, "/usr/bin/wh");
        assert_eq!(b.args, vec!["serve", "--port", "8000"]);
        // Port is re-parsed from the override for owner discovery.
        assert_eq!(b.port, 8000);
    }
}
