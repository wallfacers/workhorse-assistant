//! On-disk app config — the app's first persistence layer (add-wsl-managed-sidecar).
//!
//! A single JSON file under the Tauri app-config dir holds the sidecar endpoint
//! and the WSL managed-mode settings. The file is the authoritative store; the
//! `AgentBridge` keeps a runtime copy of the endpoint and persists changes back
//! through [`ConfigStore`], while the WSL supervisor reads [`WslConfig`] from it.
//!
//! A missing, unreadable, or malformed file never blocks startup: it falls back
//! to [`AppConfig::default`] (managed off, default endpoint). Writes are atomic
//! (temp file + rename) so a crash mid-write cannot truncate the live config.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

/// Endpoint env override. Takes precedence over the persisted value at startup
/// (resolution order: env → config → built-in default), matching the
/// `agent-auto-connect` / `wsl-managed-sidecar` spec.
pub const ENDPOINT_ENV: &str = "WORKHORSE_AGENT_ENDPOINT";
const DEFAULT_ENDPOINT: &str = "http://127.0.0.1:7821";
const DEFAULT_PORT: u16 = 7821;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WslConfig {
    /// The managed-sidecar toggle. Off → behaviour identical to plain attach.
    pub managed: bool,
    /// WSL distro registration name (`wsl -l -q`) the sidecar runs in.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub distro: Option<String>,
    /// Advanced override for the in-distro command after `exec `. `None` ⇒ the
    /// convention default (`workhorse-agent serve --host 127.0.0.1 --port <p>`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub serve_cmd_override: Option<String>,
    /// Loopback port the sidecar binds inside the distro.
    pub port: u16,
}

impl Default for WslConfig {
    fn default() -> Self {
        Self { managed: false, distro: None, serve_cmd_override: None, port: DEFAULT_PORT }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub endpoint: String,
    #[serde(default)]
    pub wsl: WslConfig,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self { endpoint: DEFAULT_ENDPOINT.to_string(), wsl: WslConfig::default() }
    }
}

/// Load the config from `path`. A missing file, an unreadable file, or malformed
/// JSON all degrade to [`AppConfig::default`] — config IO must never block
/// startup. Malformed content is logged (not surfaced as a blocking error).
pub fn load(path: &Path) -> AppConfig {
    let raw = match std::fs::read_to_string(path) {
        Ok(s) => s,
        Err(_) => return AppConfig::default(),
    };
    match serde_json::from_str(&raw) {
        Ok(cfg) => cfg,
        Err(e) => {
            eprintln!("config: ignoring malformed {}: {e}", path.display());
            AppConfig::default()
        }
    }
}

/// Persist `cfg` to `path` atomically (write a sibling temp file, then rename).
pub fn save(path: &Path, cfg: &AppConfig) -> std::io::Result<()> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let json = serde_json::to_string_pretty(cfg)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, json.as_bytes())?;
    std::fs::rename(&tmp, path)
}

/// Resolve the effective endpoint: an explicit env override wins, otherwise the
/// persisted (or defaulted) config value. Pure for testability — the caller
/// passes the env value.
pub fn resolve_endpoint(env_override: Option<&str>, config_endpoint: &str) -> String {
    match env_override {
        Some(v) if !v.trim().is_empty() => v.trim().to_string(),
        _ => config_endpoint.to_string(),
    }
}

/// `app_config_dir/config.json`, or `None` if the platform path is unavailable.
pub fn config_path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join("config.json"))
}

/// Owns the persisted [`AppConfig`] behind a mutex and writes through to disk.
/// Managed as Tauri state; shared by the agent bridge (endpoint) and the WSL
/// supervisor (wsl settings). With no resolvable path it operates in-memory only.
pub struct ConfigStore {
    path: Option<PathBuf>,
    inner: Mutex<AppConfig>,
}

impl ConfigStore {
    /// Load from the app-config dir (used at startup). Falls back to defaults.
    pub fn load_from(app: &AppHandle) -> Self {
        let path = config_path(app);
        let cfg = path.as_ref().map(|p| load(p)).unwrap_or_default();
        Self { path, inner: Mutex::new(cfg) }
    }

    /// The persisted endpoint (before env-override resolution).
    pub fn endpoint(&self) -> String {
        self.inner.lock().unwrap().endpoint.clone()
    }

    /// Update and persist the endpoint.
    pub fn set_endpoint(&self, endpoint: String) {
        let mut cfg = self.inner.lock().unwrap();
        cfg.endpoint = endpoint;
        self.persist(&cfg);
    }

    /// The current WSL managed-mode settings.
    pub fn wsl(&self) -> WslConfig {
        self.inner.lock().unwrap().wsl.clone()
    }

    /// Replace and persist the WSL managed-mode settings.
    pub fn set_wsl(&self, wsl: WslConfig) {
        let mut cfg = self.inner.lock().unwrap();
        cfg.wsl = wsl;
        self.persist(&cfg);
    }

    fn persist(&self, cfg: &AppConfig) {
        if let Some(path) = &self.path {
            if let Err(e) = save(path, cfg) {
                eprintln!("config: failed to persist {}: {e}", path.display());
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_path(tag: &str) -> PathBuf {
        std::env::temp_dir().join(format!("wh-cfg-{}-{}.json", std::process::id(), tag))
    }

    #[test]
    fn round_trips_through_disk() {
        let path = temp_path("roundtrip");
        let _ = std::fs::remove_file(&path);
        let cfg = AppConfig {
            endpoint: "http://127.0.0.1:9000".into(),
            wsl: WslConfig {
                managed: true,
                distro: Some("Ubuntu".into()),
                serve_cmd_override: None,
                port: 9000,
            },
        };
        save(&path, &cfg).unwrap();
        assert_eq!(load(&path), cfg);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn missing_file_falls_back_to_default() {
        let path = temp_path("missing");
        let _ = std::fs::remove_file(&path);
        assert_eq!(load(&path), AppConfig::default());
    }

    #[test]
    fn malformed_file_falls_back_to_default_not_panic() {
        let path = temp_path("corrupt");
        std::fs::write(&path, b"{ this is not json ]]").unwrap();
        assert_eq!(load(&path), AppConfig::default());
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn config_missing_wsl_block_uses_default_wsl() {
        let path = temp_path("nowsl");
        std::fs::write(&path, br#"{"endpoint":"http://127.0.0.1:7821"}"#).unwrap();
        let cfg = load(&path);
        assert_eq!(cfg.wsl, WslConfig::default());
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn env_override_wins_over_persisted_endpoint() {
        assert_eq!(
            resolve_endpoint(Some("http://127.0.0.1:7821"), "http://127.0.0.1:9000"),
            "http://127.0.0.1:7821"
        );
    }

    #[test]
    fn persisted_endpoint_used_when_no_env() {
        assert_eq!(resolve_endpoint(None, "http://127.0.0.1:9000"), "http://127.0.0.1:9000");
        assert_eq!(resolve_endpoint(Some("   "), "http://127.0.0.1:9000"), "http://127.0.0.1:9000");
    }

    #[test]
    fn default_endpoint_and_managed_off() {
        let cfg = AppConfig::default();
        assert_eq!(cfg.endpoint, "http://127.0.0.1:7821");
        assert!(!cfg.wsl.managed);
        assert_eq!(cfg.wsl.port, 7821);
    }
}
