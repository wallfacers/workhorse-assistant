# Wire contract — agent-ui-control

Concrete, language-neutral reference for the three layers. The TS shapes live
in `src/agent/contract.ts`; the Rust bridge and the workhorse-agent (Go) proxy
tool class implement against the JSON below. Changing anything here is a
cross-repo coordination point (`feedback_multi-agent-git-coordination`).

## Error taxonomy

`IpcErrorKind` = `validation | not_found | transient | internal | forbidden`.

Origin split (so neither side carries the other's kinds):

| kind        | originates in            | meaning                                            |
|-------------|--------------------------|----------------------------------------------------|
| `validation`| TS / Rust                | bad arguments                                      |
| `not_found` | TS control surface       | tool/element absent or hidden                      |
| `forbidden` | TS control surface only  | element exists but lacks `data-agent-clickable`    |
| `transient` | Rust bridge only         | sidecar unreachable / SSE dropped                  |
| `internal`  | TS / Rust                | unexpected exception (handler threw, etc.)         |

`forbidden` never crosses the Rust boundary; `transient` is never produced by
the TS control surface. The Rust bridge defines its own error enum mirroring
`PtyError` and MUST include `Transient`.

## Result envelope

```jsonc
// success
{ "ok": true, "value": <shape described by the tool's outputSchema> }
// failure
{ "ok": false, "error": { "kind": <IpcErrorKind>, "message": "string", "details": <optional> } }
```

A `{ok:false}` envelope is surfaced to the model as an `is_error` tool_result.

## Tool catalog entry

```jsonc
{
  "name": "open_tab",                       // unique, kebab/snake
  "description": "human-readable, model-facing",
  "inputSchema":  { /* JSON Schema for parameters */ },
  "outputSchema": { /* JSON Schema for `value`; {"type":"null"} for void */ },
  "parallelSafety": "safe" | "unsafe"       // readers safe, actions unsafe
}
```

`parallelSafety:"unsafe"` ⇒ Go orchestrator must not batch it concurrently.

### Catalog publish result (Go → renderer)

```jsonc
{
  "registered": ["open_tab", "get_open_tabs"],
  "rejected":   [{ "name": "read", "reason": "collides with server-side tool" }]
}
```

Per-entry name collision with a server-side tool ⇒ that entry is rejected
(server-side retained), non-colliding entries still register.

**This result is delivered asynchronously**, not as the publish POST's response
body. The publish `POST` acks with `202` (empty body); the agent emits the
breakdown as a `frontend_tools_published` server event over the SSE stream, and
the Rust bridge relays it to the renderer as the Tauri event
`agent://published/{sessionId}` (`{ sessionId, registered, rejected }`, empty
sets normalised to `[]`).

## Bridge payloads

Downstream — Tauri event `agent://tooluse/{sessionId}` (sidecar → Rust → renderer):

```jsonc
{
  "sessionId": "<sidecar-allocated session id>",
  "seq": 0,                 // bridge-assigned, monotonic per session
  "toolUseId": "<id from the agent>",
  "name": "open_tab",
  "input": { /* matches the tool's inputSchema */ }
}
```

The renderer orders actions by `seq`, never by arrival.

Upstream — `tool_result` (renderer → Rust → sidecar `POST`):

```jsonc
{
  "sessionId": "<same session id>",
  "toolUseId": "<same id, for correlation>",
  "result": { /* Result envelope above */ }
}
```

## HTTP transport (real workhorse-agent protocol)

The Rust bridge speaks the agent's Streamable-HTTP protocol
(`internal/api/stream_post.go`, `sessions.go`; agent change
`add-frontend-tool-bridge`). The earlier `/events` + `/tools` endpoints were a
wrong assumption; the authoritative surface is:

| direction | endpoint | body / event |
|-----------|----------|--------------|
| create session | `POST /v1/sessions` | `{provider, model, workdir}` → `{ "id": "..." }` |
| subscribe | `GET /v1/sessions/{id}/stream` | text/event-stream |
| tool result | `POST /v1/sessions/{id}/stream` | `{ "type":"frontend_tool_result", "tool_use_id", "result" }` → `202` |
| publish catalog | `POST /v1/sessions/{id}/stream` | `{ "type":"publish_frontend_tools", "catalog" }` → `202` |
| server event (down) | SSE | `frontend_tool_use {tool_use_id, name, input}` |
| server event (down) | SSE | `frontend_tools_published {registered, rejected}` |

`provider`/`model` default in the Rust bridge (env-overridable:
`WORKHORSE_AGENT_PROVIDER` / `_MODEL`); `workdir` is the current project dir
supplied by the renderer (empty ⇒ app process cwd). All payloads are
`ClientMessage{type,payload}` envelopes — the bridge correlation id rides the
`tool_use_id` field (distinct from the model's own tool_use_id; see the agent
design D2).

## Session identity

The agent session id is allocated by the sidecar (`POST /v1/sessions`, `id`
field) and returned to the renderer on attach. It keys every event, payload, and
the Go-side catalog registration. It is distinct from PTY session ids.

## Timeout / liveness

If no `tool_result` arrives before the tool's timeout, the Go side synthesizes
an `is_error` tool_result so the turn never hangs. The renderer makes no direct
network call to the sidecar — all traffic flows through the Rust bridge.
