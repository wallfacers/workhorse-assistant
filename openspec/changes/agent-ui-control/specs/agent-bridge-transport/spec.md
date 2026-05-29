## ADDED Requirements

### Requirement: Sidecar connection and discovery

The Rust bridge SHALL own a single HTTP connection to the workhorse-agent sidecar — POST for upstream client events (catalog, `tool_result`) and a GET SSE subscription for downstream server events (`tool_use`), per the sidecar's protocol. The bridge SHALL resolve the sidecar endpoint from configuration, defaulting to `127.0.0.1:7821`, and SHALL NOT spawn or supervise the sidecar process. The renderer↔Rust segment SHALL use Tauri commands and Tauri native events, not HTTP/SSE.

#### Scenario: Attach discovers and connects to the configured endpoint

- **WHEN** the renderer attaches a session and no connection is open
- **THEN** the bridge connects to the configured sidecar endpoint (default `127.0.0.1:7821`) lazily and opens the SSE subscription

#### Scenario: Sidecar unreachable

- **WHEN** the bridge cannot reach the sidecar endpoint on attach
- **THEN** the attach command returns `{ok:false, error:{kind:"transient", message}}` and does not crash the app

#### Scenario: SSE connection drops mid-session

- **WHEN** the downstream SSE subscription drops while a session is attached
- **THEN** the bridge attempts bounded reconnection
- **AND** any in-flight frontend tool whose result can no longer be delivered is allowed to reach its tool timeout on the agent side

### Requirement: Rust-proxied bridge transport

The renderer SHALL communicate with the workhorse-agent sidecar only through Tauri Rust commands and Tauri events; it SHALL NOT open direct network connections (HTTP/SSE/WebSocket) to the sidecar. The Rust layer SHALL hold the sidecar connection and broker traffic in both directions.

#### Scenario: Renderer never connects directly

- **WHEN** the renderer needs to reach the agent session
- **THEN** it calls a Tauri command and subscribes to Tauri events
- **AND** no `fetch`/`EventSource`/`WebSocket` to `127.0.0.1` originates from the renderer

### Requirement: Agent session identity

The agent session is created and identified by the workhorse-agent sidecar (its `POST /v1/sessions` returns the session id); this id — NOT a PTY session id — is what the bridge uses in `agent://tooluse/{sessionId}`, in upstream `tool_result`/catalog payloads, and for Go-side catalog registration. The bridge SHALL surface the sidecar-allocated id to the renderer when a session is attached.

#### Scenario: Attach yields the sidecar-allocated session id

- **WHEN** the renderer attaches a new agent session
- **THEN** the bridge creates/obtains the session from the sidecar and returns the sidecar-allocated session id to the renderer
- **AND** that id is used for all subsequent events and payloads for this session

### Requirement: Downstream tool_use relay

The Rust bridge SHALL relay `tool_use` events from the sidecar session to the renderer as Tauri events, scoped per session. Because Tauri event delivery order is not guaranteed, each relayed payload SHALL carry a monotonically increasing per-session sequence number `seq` assigned by the bridge, so the renderer can order tool invocations deterministically rather than relying on event arrival order.

#### Scenario: Relay a tool_use to the renderer

- **WHEN** the sidecar emits a frontend `tool_use` for an attached session
- **THEN** the Rust bridge emits a corresponding Tauri event carrying `{seq, toolUseId, name, input}` to the renderer

#### Scenario: Renderer orders by seq

- **WHEN** two `tool_use` events for the same session arrive at the renderer out of order
- **THEN** the renderer sequences action execution by `seq`, not by arrival order

### Requirement: Upstream tool_result and catalog forwarding

The Rust bridge SHALL forward the renderer's tool catalog at session start and the renderer's `tool_result` payloads to the sidecar session, preserving the `tool_use_id` correlation.

#### Scenario: Forward a tool_result upstream

- **WHEN** the renderer returns a result for `toolUseId` via a Tauri command
- **THEN** the Rust bridge delivers a `tool_result` with that same `tool_use_id` to the sidecar session

#### Scenario: Publish the catalog at session start

- **WHEN** the renderer attaches to a session and provides its tool catalog
- **THEN** the Rust bridge forwards the catalog to the sidecar before the first turn proceeds

### Requirement: No new renderer permissions

The bridge SHALL be implemented as Tauri custom commands and native events, which require no `capabilities/default.json` entries (only plugin/core permissions do, as with the existing PTY commands). The change SHALL NOT grant the renderer any `fs:*`/`shell:*`/`http:*` permissions.

#### Scenario: No capability changes for custom commands

- **WHEN** the bridge commands and events are added
- **THEN** `capabilities/default.json` gains no new entries for them
- **AND** no `fs:*`/`shell:*`/`http:*` permission is added anywhere
