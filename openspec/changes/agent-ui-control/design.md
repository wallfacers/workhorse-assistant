## Context

Today the agent only exists as a CLI inside a PTY pane (claude/codex spawned by the launch-profile PTY path); the renderer and the Go agent (workhorse-agent) share **no programmatic channel at all** — this change introduces the first one. workhorse-agent speaks an MCP-style Streamable HTTP protocol (POST for client events + GET SSE for server events) with `tool_use` / `tool_result` events and a `Tool` interface whose tools execute server-side (Read/Write/Bash/Grep). The renderer is React 19 + strict TS, and all privileged work is required by `AGENTS.md` to route through Tauri Rust commands — the renderer must not make direct network or LLM calls.

The transport is therefore **two distinct segments**, not one stream:

1. **renderer ↔ Rust** — Tauri `invoke` commands (renderer→Rust) and Tauri native events via `app.emit`/`listen` (Rust→renderer). This mirrors the proven PTY path, which emits `pty://output/{session_id}` from a reader thread (`src-tauri/src/pty/mod.rs`). **This segment is NOT HTTP/SSE.**
2. **Rust ↔ Go sidecar** — an HTTP client the Rust layer owns: POST to submit `tool_result`/catalog (ClientEvents) and a GET SSE subscription to receive `tool_use` (ServerEvents), per workhorse-agent's protocol.

Note: Tauri **custom commands** (like PTY's `pty_spawn`…) require **no** `capabilities/default.json` entries — only plugin/core permissions do. The bridge commands likewise need none.

This change adds three cooperating capabilities — `ui-control-surface` (renderer), `agent-frontend-tools` (Go), `agent-bridge-transport` (Rust glue) — so the agent can call UI tools and await their results.

## Goals / Non-Goals

**Goals:**
- Let the Go agent invoke renderer UI actions and read UI state as ordinary tools, with results round-tripped back into its loop.
- Keep all UI tool definitions in TS; adding a button means changing only the renderer, never the Go code.
- Honor the `AGENTS.md` boundary: no direct renderer→sidecar network/LLM traffic; everything flows through Rust.
- Support both structured semantic tools and a generic `data-testid` fallback.

**Non-Goals:**
- Vision/pixel-coordinate clicking or screenshot-based control.
- Multi-user, auth between renderer and sidecar, or persisting task metadata.
- Replacing the PTY-embedded CLI agents; this is an additive control channel.

## Decisions

### D1 — Frontend tools as a new proxy tool class in workhorse-agent (not MCP server in renderer)
The agent's `Run()` for a frontend tool does not execute locally; it emits a `tool_use` ServerEvent and blocks on the matching `tool_result` ClientEvent, keyed by `tool_use_id`, reusing existing timeout/cancel/panic handling.
- *Alternative considered*: stand up an MCP server inside the renderer and register it with the agent. Rejected — heavier, and the renderer can't host a server cleanly inside a Tauri webview; the proxy-tool approach reuses the agent's existing event plumbing.

### D2 — Dynamic per-session tool catalog (not hardcoded UI tools in Go)
On session start the renderer publishes a catalog `{name, description, jsonSchema}[]`; the agent merges it into that session's tool surface only. This keeps UI evolution entirely in TS and scopes tools to a live UI.
- *Alternative considered*: a fixed UI tool list compiled into Go. Rejected — every new button would require a cross-repo Go change.

### D3 — Rust-proxied transport mirroring the PTY pattern
The Rust layer owns the HTTP/SSE connection to the sidecar (segment 2 above). A Tauri command attaches the sidecar session and forwards the renderer's `tool_result` and tool catalog upstream (HTTP POST); the Rust SSE subscription relays downstream `tool_use` to the renderer as a per-session Tauri event `agent://tooluse/{sessionId}` (matching PTY's verified `pty://output/{session_id}` convention). Each relay payload carries a bridge-assigned monotonic `seq` because Tauri event delivery order is not guaranteed — the renderer orders actions by `seq`, never by arrival. The renderer never touches the sidecar endpoint directly.
- *Alternative considered*: renderer uses `fetch`/`EventSource` to the loopback sidecar. Rejected — violates the `AGENTS.md` "no network from renderer" rule and diverges from the proven PTY pattern.

### D4 — Sidecar endpoint discovery: attach to a configured endpoint (do not spawn)
V1 **attaches** to a workhorse-agent already listening on a configured endpoint (default loopback `127.0.0.1:7821`); Rust does not spawn or supervise the sidecar. The **agent session id is allocated by the sidecar** (`POST /v1/sessions`) — distinct from PTY ids — and the bridge returns it to the renderer on attach; it keys all events, payloads, and Go-side catalog registration. Rationale: the user runs long-lived agent processes themselves and the project must never assume ownership of their lifecycle (`feedback_never-kill-user-processes`). Connection is lazy (on first session attach) with bounded reconnect on drop; if no sidecar is reachable, attach returns a `transient` IPC error the renderer surfaces inline.
- *Alternative considered*: Rust spawns the sidecar as a Tauri sidecar binary. Rejected for V1 — conflicts with user-owned process lifecycle; can be a later opt-in.

### D5 — Concurrency: serialize action handlers, allow concurrent state readers
workhorse-agent batches parallel-safe tools (`CanRunInParallel`), so multiple frontend `tool_use` can arrive concurrently. The renderer executes **action** handlers (state-mutating) serially in arrival order to avoid races (e.g. two `open_tab` calls); **state readers** (side-effect-free) may run concurrently. The corresponding frontend tools are registered as parallel-unsafe (actions) vs parallel-safe (readers) so the Go orchestrator batches them correctly. Readers observe **live state at invocation time** (no global read-write lock), so a reader issued alongside an action may see pre-action state; to read after an action, the agent invokes the reader only after receiving that action's result.

### D6 — Two tool tiers with an opt-in fallback boundary
Tier 1: registered semantic actions/state readers with typed JSON schemas (preferred — reliable, meaningful). Tier 2: a generic `click_by_testid` / `read_by_testid` fallback. To bound what the generic *clicker* can reach, `click_by_testid` operates **only** on **visible** elements carrying both a stable `data-testid` **and** an explicit opt-in attribute `data-agent-clickable`; destructive controls simply omit the opt-in. "Visible" = non-null `offsetParent` + non-zero box (testable). A present-but-not-opted-in element returns `forbidden` (exists but not allowed), distinct from `not_found` (absent/hidden) — different signals drive different agent retries; this adds a `forbidden` kind to `IpcErrorKind`. `read_by_testid` is side-effect-free, needs only `data-testid` (no opt-in), and returns a bounded subset `{tagName, textContent, disabled, visible}`, never raw `innerHTML`. Selectors use these attributes, never positional/visual cues.

### D7 — Catalog may be re-published to replace a session's frontend tools
Publishing a catalog **replaces** that session's frontend tool set, so the renderer can re-publish when the mounted UI changes materially (e.g. a modal opens). Between publishes, invoking a now-unmounted tool returns a structured `not_found` rather than hanging or erroring opaquely. **Trigger (V1): manual** — components call `republishCatalog()` from their mount/unmount effects; an automatic React-effect-based tracker is a deferred simplification. Name collisions with server-side tools are rejected per-entry and reported (frontend entry dropped, server-side retained).

### D8 — Result envelope reuses the IPC `Result<T>` shape; catalog carries input + output schemas
Frontend tool execution returns `{ok, value}` or `{ok:false, error:{kind,message}}`, surfaced to the agent as a normal (possibly `is_error`) `tool_result`, so the agent loop handles UI failures like any tool failure. Each catalog entry carries **both** `inputSchema` (parameters) and `outputSchema` (shape of `value`, `{type:"null"}` for void actions) so the model can reason about what a tool returns, not just what it takes.

## Risks / Trade-offs

- **Cross-process round-trip latency per UI action** → Acceptable: dwarfed by LLM round-trip; actions are infrequent relative to model time. Batchable later if needed.
- **`tool_use_id` correlation / orphaned waits if renderer drops** → Mitigation: reuse the agent's existing per-tool timeout; on timeout synthesize an `is_error` tool_result so the loop never hangs.
- **Stale catalog if UI unmounts a registered action mid-session** → Mitigation: executing a now-missing action returns a structured `not_found` error rather than throwing; catalog can be re-published on significant UI changes.
- **Cross-repo coordination (renderer/Tauri here, tool class in Go repo)** → Mitigation: define the wire contract (events, catalog schema, result envelope) in this spec first; implement Go side against it; follow `feedback_multi-agent-git-coordination` (commit only own files, no `-A`).
- **Generic fallback could let the agent click anything** → Mitigation (D6): Tier-2 requires an explicit `data-agent-clickable` opt-in in addition to `data-testid`; destructive controls omit it and stay unreachable by the generic clicker.
- **Sidecar unreachable / dropped mid-turn** → Mitigation (D4): lazy connect with bounded reconnect; attach failures surface as `transient`; an in-flight tool whose result can't be delivered falls back to the agent's tool timeout (`is_error`).
- **SSE reconnection gap** → Any `tool_use` the sidecar emits during the reconnect window is lost (SSE delivers only new events on reconnect, no replay); the agent's tool timeout handles it as a normal failure. The sidecar MAY buffer recent events, but this spec does not require it.
- **App shutdown with pending upstream results** → If the renderer has executed a tool but Rust hasn't yet POSTed the `tool_result` when the app closes, the result is lost. Mitigation: on shutdown (mirroring PTY's `RunEvent::Exit`/`WindowEvent::Destroyed` → `kill_all`) the bridge best-effort drains pending `tool_result` before exiting; if drain fails, the agent's tool timeout covers it. Accepted edge case, not a correctness bug.

## Migration Plan

Additive only — no existing behavior changes. Ship behind the renderer's session-start catalog publish; if the catalog is empty the agent simply has no UI tools and behaves exactly as today. Rollback = stop publishing the catalog / remove the new Tauri command; PTY path is untouched.

## Resolved Questions

- **Event channel naming**: per-session `agent://tooluse/{sessionId}`, matching the verified PTY `pty://output/{session_id}` convention — eases per-session `UnlistenFn` cleanup and avoids renderer-side demuxing.
- **Go proxy tool class scheduling**: tracked as a **coordinated follow-up** in the workhorse-agent repo (tasks group 4). The wire contract (events, catalog schema, result envelope) is fixed here; the TS control surface + Rust bridge are validated against a mock `tool_use` first, with the Go side as the last integration step.

## Implementation Notes (as built)

Decisions made while implementing groups §1–§3 (the Go side §4 and manual E2E
§5.0–§5.4 remain, gated on the workhorse-agent repo and a running app):

- **Tab addressing by index, not id.** The workspace reducer mints group ids
  with `crypto.randomUUID()`, so the model can't supply one. The first semantic
  tools (`useAgentTabTools.ts`) expose `open_tab {profileId}` / `focus_tab
  {index}` and `get_open_tabs → {index, label, active}` — addressing tabs by
  index and label. (The `focus_pane` placeholder in early tasks became
  `focus_tab`, matching the groups model.)
- **`ToolError` carries the kind.** Handlers return a raw `value` on success;
  to fail with a specific kind (e.g. `forbidden` vs `not_found`) they throw
  `ToolError(kind, message)`, which the registries map to `{ok:false}`. Any
  other thrown value maps to `internal`. This keeps the D6 forbidden/not_found
  distinction without a dual return-shape.
- **Rust transport = `ureq` (blocking).** Chosen over an async client so the SSE
  reader composes with the same thread model as PTY (`spawn_reader`); TLS is
  disabled since the sidecar is loopback. The concrete HTTP surface is the
  agent's real Streamable-HTTP protocol — `POST /v1/sessions` `{provider, model,
  workdir}` and `GET|POST /v1/sessions/{id}/stream` carrying `ClientMessage`
  envelopes (`frontend_tool_result`, `publish_frontend_tools`) and the
  `frontend_tool_use` / `frontend_tools_published` server events — documented in
  `contract.md`. (The earlier `/events`+`/tools` assumption was wrong; §6 of
  `tasks.md` tracks the realignment.)
- **Shutdown drain = in-flight counter.** Upstream POSTs are synchronous on a
  worker thread; the bridge tracks an in-flight count and `shutdown()` waits a
  bounded 500 ms for it to reach zero (best-effort, mirroring PTY `kill_all`).
- **Tests:** vitest + jsdom for the control surface (22 tests); `#[cfg(test)]`
  for the bridge error/endpoint paths. jsdom lacks `CSS.escape`, polyfilled in a
  test-only setup file.

## Open Questions

- Exact configuration surface for the sidecar endpoint (config file key vs env
  var); V1 reads `WORKHORSE_AGENT_ENDPOINT`, default `127.0.0.1:7821`.
