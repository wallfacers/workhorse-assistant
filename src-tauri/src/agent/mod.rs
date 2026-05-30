//! Agent bridge — segment 2 of the renderer ↔ Go-sidecar transport.
//!
//! The renderer never talks to the workhorse-agent sidecar directly (the
//! `AGENTS.md` "no network from renderer" rule). Instead this module owns the
//! HTTP/SSE connection and mirrors the proven PTY pattern:
//!
//!   * downstream `tool_use` arrives on a per-session SSE reader thread and is
//!     relayed to the renderer as the Tauri event `agent://tooluse/{sessionId}`
//!     (cf. PTY's `pty://output/{session_id}`), each stamped with a monotonic
//!     per-session `seq` because Tauri event order is not guaranteed;
//!   * upstream `tool_result` and the tool catalog are POSTed to the sidecar.
//!
//! V1 **attaches** to an already-running sidecar (default `127.0.0.1:7821`); it
//! never spawns or supervises it — the user owns that process lifecycle
//! (`feedback_never-kill-user-processes`). The agent session id is allocated by
//! the sidecar (`POST /v1/sessions`).
//!
//! HTTP surface — the **real** workhorse-agent Streamable-HTTP protocol
//! (`internal/api/stream_post.go`, `sessions.go`; `add-frontend-tool-bridge`):
//!
//! - `POST /v1/sessions` `{provider, model, workdir}` → `{ "id": "..." }`
//! - `GET /v1/sessions/{id}/stream` → text/event-stream
//! - `POST /v1/sessions/{id}/stream` ← `ClientMessage` envelopes
//!   `{type:"frontend_tool_result", tool_use_id, result}` and
//!   `{type:"publish_frontend_tools", catalog}`. Both ack with `202`; a
//!   publish's registered/rejected breakdown is **not** in the response body —
//!   it arrives asynchronously as the `frontend_tools_published` event below.
//! - server events relayed to the renderer:
//!   `frontend_tool_use {tool_use_id, name, input}` → `agent://tooluse/{id}`;
//!   `frontend_tools_published {registered, rejected}` → `agent://published/{id}`

use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};

const DEFAULT_ENDPOINT: &str = "http://127.0.0.1:7821";
const ENDPOINT_ENV: &str = "WORKHORSE_AGENT_ENDPOINT";
// POST /v1/sessions requires provider+workdir; model is optional and falls back
// to the sidecar's config `models.default` when omitted. Both are env-overridable.
const DEFAULT_PROVIDER: &str = "anthropic";
const PROVIDER_ENV: &str = "WORKHORSE_AGENT_PROVIDER";
const MODEL_ENV: &str = "WORKHORSE_AGENT_MODEL";
const HTTP_TIMEOUT: Duration = Duration::from_secs(10);
const RECONNECT_MAX_ATTEMPTS: u32 = 5;
const RECONNECT_BASE_DELAY_MS: u64 = 250;
const SHUTDOWN_DRAIN_BUDGET: Duration = Duration::from_millis(500);

/// Renderer-facing error mirroring `src/ipc/result.ts`'s `IpcError`. Note the
/// kind set is the Rust half of the taxonomy: `forbidden` is produced only by
/// the TS control surface and never crosses this boundary; `transient` is
/// produced only here (sidecar unreachable / SSE dropped).
#[derive(Debug, Serialize)]
pub struct AgentError {
    pub kind: ErrorKind,
    pub message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorKind {
    // Reserved for argument validation on future bridge commands; kept for
    // parity with the documented taxonomy even though nothing emits it yet.
    #[allow(dead_code)]
    Validation,
    NotFound,
    Transient,
    Internal,
}

impl AgentError {
    fn not_found(message: impl Into<String>) -> Self {
        Self { kind: ErrorKind::NotFound, message: message.into() }
    }
    fn transient(message: impl Into<String>) -> Self {
        Self { kind: ErrorKind::Transient, message: message.into() }
    }
    fn internal(message: impl Into<String>) -> Self {
        Self { kind: ErrorKind::Internal, message: message.into() }
    }
}

/// Expected protocol version. Must match `api.ProtocolVersion` in the Go sidecar.
const EXPECTED_PROTOCOL_VERSION: &str = "1";

/// Response shape from `GET /health`. Used by `agent_health_check` to verify
/// identity and compatibility before attaching.
#[derive(Debug, serde::Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct HealthInfo {
    pub ok: bool,
    pub version: String,
    pub protocol_version: String,
    pub capabilities: Vec<String>,
}

impl AgentBridge {
    /// Probe `GET /health` on the configured endpoint. Returns a `HealthInfo`
    /// on success, or an `AgentError` on failure:
    ///   - `transient` — network error (unreachable, timeout)
    ///   - `internal` — incompatible sidecar (protocol_version mismatch)
    pub fn health_check(&self) -> Result<HealthInfo, AgentError> {
        let endpoint = self.endpoint();
        let resp = ureq::get(&format!("{endpoint}/health"))
            .timeout(Duration::from_secs(3))
            .call()
            .map_err(|e| AgentError::transient(format!("sidecar unreachable: {e}")))?;
        let info: HealthInfo = resp
            .into_json()
            .map_err(|e| AgentError::internal(format!("bad /health response: {e}")))?;
        if !info.ok {
            return Err(AgentError::internal("sidecar /health returned ok:false"));
        }
        if info.protocol_version != EXPECTED_PROTOCOL_VERSION {
            return Err(AgentError::internal(format!(
                "incompatible sidecar: protocol_version {} (expected {})",
                info.protocol_version, EXPECTED_PROTOCOL_VERSION
            )));
        }
        Ok(info)
    }
}

/// Payload of `agent://tooluse/{sessionId}`. Field names are camelCase to match
/// the TS `ToolUsePayload` interface in `src/agent/contract.ts`.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ToolUsePayload {
    session_id: String,
    seq: u64,
    tool_use_id: String,
    name: String,
    input: Value,
}

/// Payload of `agent://published/{sessionId}` — the async outcome of a
/// `publish_frontend_tools`, relayed from the agent's `frontend_tools_published`
/// server event. Field names are camelCase to match the TS
/// `CatalogPublishedPayload` interface.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct PublishedPayload {
    session_id: String,
    registered: Value,
    rejected: Value,
}

/// Payload of `agent://text/{sessionId}` — assistant text delta relayed from the
/// sidecar's `assistant_text_delta` SSE event.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TextDeltaPayload {
    session_id: String,
    delta: String,
}

/// Payload of `agent://textdone/{sessionId}` — assistant text done relayed from
/// the sidecar's `assistant_text_done` SSE event.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TextDonePayload {
    session_id: String,
    message_id: String,
    stop_reason: String,
}

/// Payload of `agent://toolstart/{sessionId}` — tool call start relayed from
/// the sidecar's `tool_call_start` SSE event.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ToolStartPayload {
    session_id: String,
    tool_call_id: String,
    name: String,
    input: Value,
}

/// Payload of `agent://tooldone/{sessionId}` — tool call done relayed from
/// the sidecar's `tool_call_done` SSE event.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ToolDonePayload {
    session_id: String,
    tool_call_id: String,
}

/// Payload of `agent://error/{sessionId}` — error from the sidecar relayed
/// from the `error` SSE event (e.g. provider model not found).
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ErrorPayload {
    session_id: String,
    code: String,
    message: String,
    recoverable: bool,
}

/// Payload of `agent://permission_request/{sessionId}` — the agent needs the
/// user to approve a tool call, relayed from the sidecar's authoritative
/// `permission_request` SSE event (the one carrying `dangerous`/`reason`).
/// Respond via the `agent_permission_decision` command. `dangerous` is true for
/// sensitive operations (e.g. a dangerous Bash command) which the sidecar
/// re-prompts every time regardless of a prior session allow.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct PermissionRequestPayload {
    session_id: String,
    request_id: String,
    tool: String,
    resource: String,
    dangerous: bool,
    reason: String,
}

/// Payload of `agent://reasoning_start/{sessionId}` — a thinking block began,
/// relayed from the sidecar's `reasoning_start` SSE event. `reasoningType` is
/// `"thinking"` (carries deltas) or `"redacted"` (no deltas follow). `blockIndex`
/// is forwarded for forward-compat; the V1 renderer keeps one reasoning part per
/// assistant message and may ignore it. The thinking block's `signature` is never
/// present in this event (the sidecar excludes it).
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ReasoningStartPayload {
    session_id: String,
    block_index: i64,
    reasoning_type: String,
}

/// Payload of `agent://reasoning_delta/{sessionId}` — a thinking-text increment,
/// relayed from the sidecar's `reasoning_delta` SSE event (regular thinking only).
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ReasoningDeltaPayload {
    session_id: String,
    block_index: i64,
    delta: String,
}

/// Payload of `agent://reasoning_end/{sessionId}` — a thinking block ended,
/// relayed from the sidecar's `reasoning_end` SSE event.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ReasoningEndPayload {
    session_id: String,
    block_index: i64,
}

/// One attached agent session: a stop flag and the SSE reader thread relaying
/// downstream `tool_use`. The seq counter lives inside the reader thread.
struct SessionHandle {
    stop: Arc<AtomicBool>,
    reader: Option<JoinHandle<()>>,
}

struct BridgeInner {
    endpoint: String,
    sessions: HashMap<String, SessionHandle>,
}

impl Default for BridgeInner {
    fn default() -> Self {
        let endpoint =
            std::env::var(ENDPOINT_ENV).unwrap_or_else(|_| DEFAULT_ENDPOINT.to_string());
        Self { endpoint, sessions: HashMap::new() }
    }
}

/// App-managed bridge. Registered via `Builder::manage` and reached in command
/// handlers through `tauri::State<'_, AgentBridge>`.
#[derive(Default)]
pub struct AgentBridge {
    inner: Mutex<BridgeInner>,
    /// Count of upstream POSTs currently in flight, so shutdown can best-effort
    /// drain them before exit (mirrors PTY `kill_all`, design D-shutdown).
    in_flight: Arc<AtomicU64>,
}

impl AgentBridge {
    fn endpoint(&self) -> String {
        self.inner.lock().unwrap().endpoint.clone()
    }

    /// Attach to a sidecar session: allocate it (`POST /v1/sessions` with the
    /// required `{provider, model, workdir}` body), spawn the SSE reader, and
    /// return the sidecar-allocated session id (`id` field). `workdir` comes
    /// from the renderer; empty falls back to the app process cwd. Lazy — the
    /// first attach is the first network touch. Unreachable ⇒ `transient`.
    pub fn attach(&self, app: &AppHandle, workdir: String) -> Result<String, AgentError> {
        let endpoint = self.endpoint();
        let provider =
            std::env::var(PROVIDER_ENV).unwrap_or_else(|_| DEFAULT_PROVIDER.to_string());
        // Model is optional: when WORKHORSE_AGENT_MODEL is unset, omit it so the
        // sidecar falls back to its config's `models.default` (e.g. "anthropic:qwen3.6-plus").
        let model_override = std::env::var(MODEL_ENV).ok();
        let workdir = if workdir.trim().is_empty() {
            std::env::current_dir()
                .map(|p| p.to_string_lossy().into_owned())
                .unwrap_or_else(|_| ".".to_string())
        } else {
            workdir
        };
        let mut body = json!({
            "provider": provider,
            "workdir": workdir,
        });
        if let Some(m) = model_override {
            body["model"] = json!(m);
        }
        let resp = ureq::post(&format!("{endpoint}/v1/sessions"))
            .timeout(HTTP_TIMEOUT)
            .send_json(body)
            .map_err(|e| AgentError::transient(format!("sidecar unreachable: {e}")))?;
        let body: Value = resp
            .into_json()
            .map_err(|e| AgentError::internal(format!("bad /v1/sessions response: {e}")))?;
        let session_id = body
            .get("id")
            .or_else(|| body.get("session_id"))
            .and_then(Value::as_str)
            .ok_or_else(|| AgentError::internal("response missing id"))?
            .to_string();

        let seq = Arc::new(AtomicU64::new(0));
        let stop = Arc::new(AtomicBool::new(false));
        let reader = spawn_sse_reader(
            app.clone(),
            endpoint,
            session_id.clone(),
            seq,
            Arc::clone(&stop),
        );

        self.inner.lock().unwrap().sessions.insert(
            session_id.clone(),
            SessionHandle { stop, reader: Some(reader) },
        );
        Ok(session_id)
    }

    /// Send a user message to the sidecar session via POST /v1/sessions/{id}/stream.
    /// The sidecar routes it to the agent's inbox and starts a turn.
    pub fn send_message(&self, session_id: &str, content: &str) -> Result<(), AgentError> {
        let endpoint = self.session_endpoint(session_id)?;
        let url = format!("{endpoint}/v1/sessions/{session_id}/stream");
        let body = json!({
            "type": "user_message",
            "content": content,
        });
        ureq::post(&url)
            .timeout(HTTP_TIMEOUT)
            .send_json(body)
            .map_err(|e| AgentError::transient(format!("send_message failed: {e}")))?;
        Ok(())
    }

    /// Cancel the active turn for a session via POST /v1/sessions/{id}/cancel.
    /// The sidecar acks with `202 Accepted` and asks the agent run to stop; this
    /// is best-effort interruption (the renderer finalises its own state too).
    pub fn cancel(&self, session_id: &str) -> Result<(), AgentError> {
        let endpoint = self.session_endpoint(session_id)?;
        let url = format!("{endpoint}/v1/sessions/{session_id}/cancel");
        ureq::post(&url)
            .timeout(HTTP_TIMEOUT)
            .call()
            .map_err(|e| AgentError::transient(format!("cancel failed: {e}")))?;
        Ok(())
    }

    /// Answer a pending permission prompt for a session by POSTing a
    /// `permission_decision` client message to the stream endpoint. `decision`
    /// is one of `allow_once`/`allow_session`/`allow_permanent`/`deny`/
    /// `deny_permanent`; the blocked agent `Check()` reads it off the answers
    /// channel and proceeds or denies the tool call.
    pub fn permission_decision(
        &self,
        session_id: &str,
        request_id: &str,
        decision: &str,
    ) -> Result<(), AgentError> {
        let endpoint = self.session_endpoint(session_id)?;
        let url = format!("{endpoint}/v1/sessions/{session_id}/stream");
        let body = json!({
            "type": "permission_decision",
            "request_id": request_id,
            "decision": decision,
        });
        ureq::post(&url)
            .timeout(HTTP_TIMEOUT)
            .send_json(body)
            .map_err(|e| AgentError::transient(format!("permission_decision failed: {e}")))?;
        Ok(())
    }

    /// Forward a renderer `tool_result` upstream, correlated by `tool_use_id`.
    pub fn forward_result(
        &self,
        session_id: &str,
        tool_use_id: &str,
        result: Value,
    ) -> Result<(), AgentError> {
        let endpoint = self.session_endpoint(session_id)?;
        let url = format!("{endpoint}/v1/sessions/{session_id}/stream");
        let body = json!({
            "type": "frontend_tool_result",
            "tool_use_id": tool_use_id,
            "result": result,
        });
        self.in_flight.fetch_add(1, Ordering::SeqCst);
        let outcome = ureq::post(&url)
            .timeout(HTTP_TIMEOUT)
            .send_json(body)
            .map(|_| ())
            .map_err(|e| AgentError::transient(format!("forward tool_result failed: {e}")));
        self.in_flight.fetch_sub(1, Ordering::SeqCst);
        outcome
    }

    /// Publish (or re-publish) the session's tool catalog upstream as a
    /// `publish_frontend_tools` client message. The POST acks with `202` and an
    /// empty body — the per-entry registered/rejected breakdown is delivered
    /// asynchronously as the `frontend_tools_published` server event (relayed to
    /// the renderer on `agent://published/{id}`), so this returns `()` on ack.
    pub fn publish_catalog(
        &self,
        session_id: &str,
        catalog: Value,
    ) -> Result<(), AgentError> {
        let endpoint = self.session_endpoint(session_id)?;
        let url = format!("{endpoint}/v1/sessions/{session_id}/stream");
        ureq::post(&url)
            .timeout(HTTP_TIMEOUT)
            .send_json(json!({ "type": "publish_frontend_tools", "catalog": catalog }))
            .map(|_| ())
            .map_err(|e| AgentError::transient(format!("publish catalog failed: {e}")))
    }

    fn session_endpoint(&self, session_id: &str) -> Result<String, AgentError> {
        let inner = self.inner.lock().unwrap();
        if !inner.sessions.contains_key(session_id) {
            return Err(AgentError::not_found(format!("unknown session: {session_id}")));
        }
        Ok(inner.endpoint.clone())
    }

    /// Detach one session: stop its reader thread.
    pub fn detach(&self, session_id: &str) {
        let handle = self.inner.lock().unwrap().sessions.remove(session_id);
        if let Some(handle) = handle {
            stop_session(handle);
        }
    }

    /// Stop every session and best-effort drain in-flight upstream POSTs, e.g.
    /// on app exit — independent of any renderer teardown (mirrors PTY
    /// `kill_all`). Bounded so shutdown never blocks indefinitely.
    pub fn shutdown(&self) {
        let drained: Vec<SessionHandle> =
            self.inner.lock().unwrap().sessions.drain().map(|(_, s)| s).collect();
        for handle in drained {
            stop_session(handle);
        }
        let deadline = Instant::now() + SHUTDOWN_DRAIN_BUDGET;
        while self.in_flight.load(Ordering::SeqCst) > 0 && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(10));
        }
    }
}

/// Signal a session's reader thread to stop and join it.
fn stop_session(mut handle: SessionHandle) {
    handle.stop.store(true, Ordering::SeqCst);
    if let Some(reader) = handle.reader.take() {
        let _ = reader.join();
    }
}

/// SSE reader thread: subscribe to the session's event stream, parse `tool_use`
/// server events, stamp a monotonic `seq`, and relay each to the renderer.
/// Bounded reconnect on stream drop; any `tool_use` emitted during a reconnect
/// gap is lost (SSE has no replay) and covered by the agent's tool timeout.
fn spawn_sse_reader(
    app: AppHandle,
    endpoint: String,
    session_id: String,
    seq: Arc<AtomicU64>,
    stop: Arc<AtomicBool>,
) -> JoinHandle<()> {
    std::thread::spawn(move || {
        let url = format!("{endpoint}/v1/sessions/{session_id}/stream");
        let mut attempts: u32 = 0;

        while !stop.load(Ordering::SeqCst) {
            match ureq::get(&url).call() {
                Ok(resp) => {
                    attempts = 0;
                    let reader = BufReader::new(resp.into_reader());
                    let mut data = String::new();
                    for line in reader.lines() {
                        if stop.load(Ordering::SeqCst) {
                            return;
                        }
                        let line = match line {
                            Ok(l) => l,
                            Err(_) => break, // stream error → reconnect
                        };
                        if line.is_empty() {
                            // Blank line terminates an SSE event.
                            relay_event(&app, &session_id, &seq, &data);
                            data.clear();
                        } else if let Some(rest) = line.strip_prefix("data:") {
                            data.push_str(rest.trim_start());
                        }
                        // Other SSE fields (event:, id:, :comment) are ignored.
                    }
                    // Stream closed cleanly; loop to resubscribe unless stopping.
                }
                Err(_) => {
                    attempts += 1;
                    if attempts > RECONNECT_MAX_ATTEMPTS {
                        return; // give up; renderer attach can retry later
                    }
                    std::thread::sleep(Duration::from_millis(
                        RECONNECT_BASE_DELAY_MS * attempts as u64,
                    ));
                }
            }
        }
    })
}

/// Parse one accumulated SSE `data` payload and relay the two event types the
/// renderer cares about: `frontend_tool_use` (stamped with the next `seq`, to
/// `agent://tooluse/{id}`) and `frontend_tools_published` (to
/// `agent://published/{id}`). All other server events are ignored here.
fn relay_event(app: &AppHandle, session_id: &str, seq: &Arc<AtomicU64>, data: &str) {
    if data.is_empty() {
        return;
    }
    let Ok(event) = serde_json::from_str::<Value>(data) else {
        return; // non-JSON keep-alive or malformed frame → skip
    };
    match event.get("type").and_then(Value::as_str) {
        Some("frontend_tool_use") => {
            let payload = ToolUsePayload {
                session_id: session_id.to_string(),
                seq: seq.fetch_add(1, Ordering::SeqCst),
                tool_use_id: event
                    .get("tool_use_id")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string(),
                name: event.get("name").and_then(Value::as_str).unwrap_or_default().to_string(),
                input: event.get("input").cloned().unwrap_or(Value::Null),
            };
            let _ = app.emit(&format!("agent://tooluse/{session_id}"), payload);
        }
        Some("frontend_tools_published") => {
            // The agent emits nil slices as JSON `null` when empty; normalise to
            // [] so the renderer always sees arrays.
            let arr = |v: Option<&Value>| match v {
                Some(x) if !x.is_null() => x.clone(),
                _ => json!([]),
            };
            let payload = PublishedPayload {
                session_id: session_id.to_string(),
                registered: arr(event.get("registered")),
                rejected: arr(event.get("rejected")),
            };
            let _ = app.emit(&format!("agent://published/{session_id}"), payload);
        }
        Some("assistant_text_delta") => {
            let delta = event.get("delta").and_then(Value::as_str).unwrap_or_default();
            let payload = TextDeltaPayload {
                session_id: session_id.to_string(),
                delta: delta.to_string(),
            };
            let _ = app.emit(&format!("agent://text/{session_id}"), payload);
        }
        Some("assistant_text_done") => {
            let payload = TextDonePayload {
                session_id: session_id.to_string(),
                message_id: event.get("message_id").and_then(Value::as_str).unwrap_or_default().to_string(),
                stop_reason: event.get("stop_reason").and_then(Value::as_str).unwrap_or_default().to_string(),
            };
            let _ = app.emit(&format!("agent://textdone/{session_id}"), payload);
        }
        Some("tool_call_start") => {
            let payload = ToolStartPayload {
                session_id: session_id.to_string(),
                tool_call_id: event.get("tool_call_id").and_then(Value::as_str).unwrap_or_default().to_string(),
                name: event.get("name").and_then(Value::as_str).unwrap_or_default().to_string(),
                input: event.get("input").cloned().unwrap_or(Value::Null),
            };
            let _ = app.emit(&format!("agent://toolstart/{session_id}"), payload);
        }
        Some("tool_call_done") => {
            let payload = ToolDonePayload {
                session_id: session_id.to_string(),
                tool_call_id: event.get("tool_call_id").and_then(Value::as_str).unwrap_or_default().to_string(),
            };
            let _ = app.emit(&format!("agent://tooldone/{session_id}"), payload);
        }
        Some("reasoning_start") => {
            let payload = ReasoningStartPayload {
                session_id: session_id.to_string(),
                block_index: event.get("block_index").and_then(Value::as_i64).unwrap_or(0),
                reasoning_type: event
                    .get("reasoning_type")
                    .and_then(Value::as_str)
                    .unwrap_or("thinking")
                    .to_string(),
            };
            let _ = app.emit(&format!("agent://reasoning_start/{session_id}"), payload);
        }
        Some("reasoning_delta") => {
            let payload = ReasoningDeltaPayload {
                session_id: session_id.to_string(),
                block_index: event.get("block_index").and_then(Value::as_i64).unwrap_or(0),
                delta: event.get("delta").and_then(Value::as_str).unwrap_or_default().to_string(),
            };
            let _ = app.emit(&format!("agent://reasoning_delta/{session_id}"), payload);
        }
        Some("reasoning_end") => {
            let payload = ReasoningEndPayload {
                session_id: session_id.to_string(),
                block_index: event.get("block_index").and_then(Value::as_i64).unwrap_or(0),
            };
            let _ = app.emit(&format!("agent://reasoning_end/{session_id}"), payload);
        }
        Some("permission_request") => {
            // The sidecar emits two permission_request frames per gated call: a
            // bare informational one (request_id = tool-call id, no `dangerous`)
            // and the authoritative prompt (request_id = ULID, with `dangerous`
            // /`reason`) whose id the PermissionAnswers channel matches. Only the
            // latter is answerable — gate on the presence of `dangerous`.
            if event.get("dangerous").is_some() {
                let payload = PermissionRequestPayload {
                    session_id: session_id.to_string(),
                    request_id: event.get("request_id").and_then(Value::as_str).unwrap_or_default().to_string(),
                    tool: event.get("tool").and_then(Value::as_str).unwrap_or_default().to_string(),
                    resource: event.get("resource").and_then(Value::as_str).unwrap_or_default().to_string(),
                    dangerous: event.get("dangerous").and_then(Value::as_bool).unwrap_or(false),
                    reason: event.get("reason").and_then(Value::as_str).unwrap_or_default().to_string(),
                };
                let _ = app.emit(&format!("agent://permission_request/{session_id}"), payload);
            }
        }
        Some("error") => {
            let payload = ErrorPayload {
                session_id: session_id.to_string(),
                code: event.get("code").and_then(Value::as_str).unwrap_or_default().to_string(),
                message: event.get("message").and_then(Value::as_str).unwrap_or_default().to_string(),
                recoverable: event.get("recoverable").and_then(Value::as_bool).unwrap_or(false),
            };
            let _ = app.emit(&format!("agent://error/{session_id}"), payload);
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn endpoint_defaults_to_loopback() {
        // With the env var unset, the bridge targets the documented default.
        // (We can't unset process env safely in parallel tests, so assert the
        // constant the default falls back to.)
        assert_eq!(DEFAULT_ENDPOINT, "http://127.0.0.1:7821");
    }

    #[test]
    fn unknown_session_is_not_found() {
        let bridge = AgentBridge::default();
        let err = bridge
            .forward_result("nope", "tu-1", serde_json::json!({"ok": true}))
            .expect_err("unknown session must be NotFound");
        assert!(matches!(err.kind, ErrorKind::NotFound));
    }
}
