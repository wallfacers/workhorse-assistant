# agent-bridge-transport Specification

## Purpose
TBD - created by archiving change agent-ui-control. Update Purpose after archive.
## Requirements
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

### Requirement: 权限规则与配置的 Rust 代理命令

Rust bridge SHALL 暴露 Tauri command，把权限规则的读取与权限配置的读/写代理到 agent 端点；渲染层 SHALL 仅通过这些 command 访问，SHALL NOT 直接发起到 sidecar 的网络请求。

- 读取生效规则：代理 `GET /v1/permissions`，返回规则数组（含 `tool`/`pattern`/`decision`/来源）。
- 读取配置真源：代理 `GET /v1/permission-config`，返回 `default_permission` 与 `preset_rules`。
- 写入配置真源：代理 `PUT /v1/permission-config`，提交 `default_permission` 与 `preset_rules`。

所有 command SHALL 沿用既有错误约定，返回 `{ok:true,...}` 或 `{ok:false, error:{kind,message}}`，并在 agent 不可达时返回 `transient` 错误而不崩溃。command 的入参/返回类型 SHALL 在 `src/ipc` 有对应 TypeScript 类型镜像。

#### Scenario: 渲染层经命令读取规则

- **WHEN** 权限设置页需要展示规则
- **THEN** 渲染层 SHALL 调用对应 Tauri command，由 Rust 代理 `GET /v1/permissions` 取回数据
- **AND** 渲染层不向 `127.0.0.1` 发起 `fetch`/`EventSource`

#### Scenario: 写入配置经命令代理到 PUT

- **WHEN** 渲染层提交新的权限配置
- **THEN** Rust bridge SHALL 调用 agent 的 `PUT /v1/permission-config` 并把结果以 `{ok}` 形式回传

#### Scenario: agent 不可达返回 transient

- **WHEN** 代理调用时 agent 端点不可达
- **THEN** command SHALL 返回 `{ok:false, error:{kind:"transient", message}}`，应用不崩溃

