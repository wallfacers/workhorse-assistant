//! On-disk app config — the app's first persistence layer (add-native-runtime-mode).
//!
//! A single JSON file under the Tauri app-config dir holds the sidecar endpoint
//! and the runtime-mode settings. The file is the authoritative store; the
//! `AgentBridge` keeps a runtime copy of the endpoint and persists changes back
//! through [`ConfigStore`], while the supervisor reads [`RuntimeConfig`] from it.
//!
//! A missing, unreadable, or malformed file never blocks startup: it falls back
//! to [`AppConfig::default`] (`Native` runtime, default endpoint). Writes are
//! atomic (temp file + rename) so a crash mid-write cannot truncate the live
//! config. There is no migration from the legacy `wsl`/`managed` schema — early
//! stage, no backward compatibility — so an old or absent `runtime` block simply
//! resolves to `Native`.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

/// Endpoint env override. Takes precedence over the persisted value at startup
/// (resolution order: env → config → built-in default), matching the
/// `agent-auto-connect` / `wsl-managed-sidecar` spec.
pub const ENDPOINT_ENV: &str = "WORKHORSE_AGENT_ENDPOINT";
const DEFAULT_ENDPOINT: &str = "http://127.0.0.1:7821";

/// Which runtime hosts the `workhorse-agent` sidecar. `Native` (default) runs the
/// bundled host binary; `Wsl` runs it inside a WSL distro (Windows only, opt-in);
/// `Remote` connects to an agent already running elsewhere (the app hosts no
/// process — the supervisor stays disabled and reachability is owned by the
/// auto-connect probe).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RuntimeKind {
    #[default]
    Native,
    Wsl,
    Remote,
}

impl RuntimeKind {
    /// Whether this runtime is **managed** by the supervisor (it spawns/reaps a
    /// local sidecar). `Remote` is not managed — the supervisor stays `Disabled`
    /// and the auto-connect probe is the sole liveness source (R2).
    pub fn is_managed(self) -> bool {
        !matches!(self, RuntimeKind::Remote)
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeConfig {
    /// The runtime mode. Default `Native`; `Wsl` is opt-in and only meaningful on
    /// a Windows host with a distro selected.
    #[serde(default)]
    pub mode: RuntimeKind,
    /// WSL distro registration name (`wsl -l -q`). Required when `mode == Wsl`;
    /// ignored otherwise.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub distro: Option<String>,
    /// Advanced override for the serve command. `None` ⇒ the convention default
    /// (`workhorse-agent serve --host 127.0.0.1 --port <p>`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub serve_cmd_override: Option<String>,
    /// Reserved for a future remote auth Bearer token (unify-runtime-source-panel
    /// non-goal: not wired this change). Persisted only when set so existing
    /// configs are untouched.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auth_token: Option<String>,
}

impl Default for RuntimeConfig {
    fn default() -> Self {
        Self { mode: RuntimeKind::Native, distro: None, serve_cmd_override: None, auth_token: None }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub endpoint: String,
    #[serde(default)]
    pub runtime: RuntimeConfig,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self { endpoint: DEFAULT_ENDPOINT.to_string(), runtime: RuntimeConfig::default() }
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

    /// The current runtime-mode settings.
    pub fn runtime(&self) -> RuntimeConfig {
        self.inner.lock().unwrap().runtime.clone()
    }

    /// Replace and persist the runtime-mode settings.
    pub fn set_runtime(&self, runtime: RuntimeConfig) {
        let mut cfg = self.inner.lock().unwrap();
        cfg.runtime = runtime;
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
            runtime: RuntimeConfig {
                mode: RuntimeKind::Wsl,
                distro: Some("Ubuntu".into()),
                serve_cmd_override: None,
                auth_token: None,
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
    fn config_missing_runtime_block_uses_default_native() {
        let path = temp_path("noruntime");
        std::fs::write(&path, br#"{"endpoint":"http://127.0.0.1:7821"}"#).unwrap();
        let cfg = load(&path);
        assert_eq!(cfg.runtime, RuntimeConfig::default());
        assert_eq!(cfg.runtime.mode, RuntimeKind::Native);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn legacy_wsl_schema_resolves_to_native() {
        // No migration (early stage): an old config with a `wsl` block and no
        // `runtime` block is ignored, falling back to the Native default.
        let path = temp_path("legacy");
        std::fs::write(
            &path,
            br#"{"endpoint":"http://127.0.0.1:7821","wsl":{"managed":true,"distro":"Ubuntu","port":7821}}"#,
        )
        .unwrap();
        let cfg = load(&path);
        assert_eq!(cfg.runtime.mode, RuntimeKind::Native);
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
    fn default_endpoint_and_native_runtime() {
        let cfg = AppConfig::default();
        assert_eq!(cfg.endpoint, "http://127.0.0.1:7821");
        assert_eq!(cfg.runtime.mode, RuntimeKind::Native);
    }

    #[test]
    fn legacy_port_field_is_ignored_endpoint_wins() {
        // Port convergence (unify-runtime-source-panel): a legacy config carrying
        // `runtime.port` deserializes fine — the now-unknown field is dropped and
        // the endpoint remains the single source of truth.
        let path = temp_path("legacyport");
        std::fs::write(
            &path,
            br#"{"endpoint":"http://127.0.0.1:7821","runtime":{"mode":"native","port":8000}}"#,
        )
        .unwrap();
        let cfg = load(&path);
        assert_eq!(cfg.endpoint, "http://127.0.0.1:7821");
        assert_eq!(cfg.runtime.mode, RuntimeKind::Native);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn remote_mode_round_trips_and_is_unmanaged() {
        let path = temp_path("remote");
        std::fs::write(
            &path,
            br#"{"endpoint":"http://10.0.0.5:7821","runtime":{"mode":"remote"}}"#,
        )
        .unwrap();
        let cfg = load(&path);
        assert_eq!(cfg.runtime.mode, RuntimeKind::Remote);
        assert!(!cfg.runtime.mode.is_managed());
        assert!(RuntimeKind::Native.is_managed());
        assert!(RuntimeKind::Wsl.is_managed());
        let _ = std::fs::remove_file(&path);
    }
}
