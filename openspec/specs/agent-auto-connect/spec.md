# agent-auto-connect Specification

## Purpose
Defines how the renderer establishes and maintains connection *health* to the
sidecar without manual user action: a pure `GET /health` probe with
protocol-version verification, bounded exponential-backoff retry, a periodic
heartbeat while connected, and the connection-status surfaces (AgentRail status
dot, Settings → Agent tab). Session attach/lifecycle is explicitly out of scope
and owned by the project-sessions capability (`SessionProvider`); `connected`
here means only "a compatible sidecar is reachable."

## Requirements
### Requirement: Enhanced health endpoint

The sidecar's `GET /health` endpoint SHALL return `protocol_version` (a string identifying the wire protocol the server speaks, e.g. `"1"`) and `capabilities` (a string array listing the named features the server supports, e.g. `["frontend_tools", "external_agents"]`). The existing fields (`ok`, `version`, `uptime_sec`, `sessions_active`) are unchanged. Consumers that only read `ok`/`version` are unaffected.

#### Scenario: Health check from a compatible frontend

- **WHEN** the frontend sends `GET /health` to a running sidecar
- **THEN** the response is `{ok:true, version:"...", protocol_version:"1", capabilities:["frontend_tools", ...], uptime_sec:N, sessions_active:N}`
- **AND** the frontend recognizes `protocol_version:"1"` as compatible

#### Scenario: Health check against an incompatible server

- **WHEN** the frontend probes a port that responds with `protocol_version:"2"` or an unknown value
- **THEN** the frontend marks the connection as `incompatible` and does NOT retry the health check
- **AND** the error message tells the user which versions are expected vs found

#### Scenario: Health check against a non-workhorse process

- **WHEN** the frontend probes a port that responds with JSON lacking `protocol_version`
- **THEN** the frontend treats this as incompatible (same as unknown protocol_version)

#### Scenario: Health check against an unreachable endpoint

- **WHEN** the frontend probes an endpoint and the TCP connection fails or times out
- **THEN** the frontend schedules a retry with exponential backoff
- **AND** does NOT mark the connection as incompatible (the sidecar may start later)

### Requirement: Rust-side health probe command

The Rust bridge SHALL expose a `agent_health_check` Tauri command that performs a `GET /health` request to the configured sidecar endpoint. It returns a typed response `{ok, version, protocol_version, capabilities}` on success, or an `AgentError` on failure (`transient` for network errors, `internal` for unexpected response shapes). The renderer calls this command to verify the sidecar is reachable and compatible; session attach is a separate concern owned by `SessionProvider` (see note on the auto-connect flow).

#### Scenario: Successful health probe

- **WHEN** the renderer invokes `agent_health_check`
- **AND** the sidecar is reachable and responds with `protocol_version:"1"`
- **THEN** the command returns `{ok:true, version:"...", protocol_version:"1", capabilities:[...]}`

#### Scenario: Sidecar unreachable

- **WHEN** the renderer invokes `agent_health_check`
- **AND** the sidecar is not listening on the endpoint
- **THEN** the command returns `AgentError{kind:"transient", message:"sidecar unreachable: ..."}`

#### Scenario: Incompatible sidecar

- **WHEN** the renderer invokes `agent_health_check`
- **AND** the response has `protocol_version:"99"` or is missing the field
- **THEN** the command returns `AgentError{kind:"internal", message:"incompatible sidecar: protocol_version ..."}`

### Requirement: Auto-connect with probe–verify flow (health only)

The renderer SHALL automatically establish connection health to the sidecar on app startup without requiring manual user action. The hook is a **pure health probe** — it does NOT attach a session, hold a `sessionId`, or listen to per-session events; session attach/lifecycle is owned by `SessionProvider`. `connected` here means "a compatible sidecar is reachable." The flow is:

1. **Probe**: call `agent_health_check`.
2. **Verify**: check `protocol_version` matches the expected value (`"1"`). `capabilities` (e.g. `frontend_tools`) is parsed and surfaced but is NOT gated on — auto-connect proceeds even if a capability is absent.
3. **Connected**: if verified, mark the connection `connected` and start the heartbeat (see below).
4. **Retry**: on transient failure (unreachable), retry the probe with exponential backoff starting at 1 s, capped at 30 s.
5. **Stop**: on incompatible response, stop retrying and surface the error. On explicit user disconnect (via Settings), pause probing.

#### Scenario: Sidecar already running when frontend starts

- **WHEN** the frontend starts and the sidecar is already listening
- **THEN** probe succeeds, verification passes, the connection is marked `connected` within a few seconds
- **AND** the status dot turns green

#### Scenario: Frontend starts before sidecar

- **WHEN** the frontend starts and the sidecar is not yet listening
- **THEN** probe fails with `transient`, the status shows "连接中…"
- **AND** retries continue with backoff until the sidecar appears
- **WHEN** the sidecar starts, the next probe succeeds and the connection is marked `connected`

#### Scenario: Sidecar is incompatible

- **WHEN** probe succeeds but `protocol_version` does not match
- **THEN** auto-connect stops, the status shows an error indicating version mismatch
- **AND** no further retries occur until the user opens Settings and clicks "重新连接"

#### Scenario: User manually disconnects

- **WHEN** the user clicks "断开连接" in Settings
- **THEN** the retry and heartbeat timers are cleared and probing pauses
- **AND** the status dot shows idle

#### Scenario: User manually reconnects after disconnect

- **WHEN** the user clicks "重新连接" in Settings after a manual disconnect
- **THEN** probing resumes from the probe step

### Requirement: Connection heartbeat while connected

While `connected`, the renderer SHALL re-probe `GET /health` on a fixed interval (30 s) to detect a sidecar that has gone away. On a failed heartbeat the connection drops to `error` and a retry is scheduled with backoff; an incompatible heartbeat response stops the heartbeat. The heartbeat is cleared on manual disconnect and on unmount.

#### Scenario: Sidecar disappears while connected

- **WHEN** the connection is `connected` and a 30 s heartbeat probe fails
- **THEN** the connection drops to `error` and a retry is scheduled with backoff

#### Scenario: Heartbeat cleared on disconnect

- **WHEN** the user manually disconnects (or the component unmounts)
- **THEN** the heartbeat interval is cleared and no further heartbeat probes run

### Requirement: Connection status indicator

The AgentRail footer SHALL show a small colored dot (6 px, `w-1.5 h-1.5`) next to the username to indicate connection status: gray for idle, pulsing amber for connecting, green for connected, red for error. The dot has a `title` attribute with status details (session ID, error message, etc.). The manual connect/disconnect button is removed.

#### Scenario: Status dot reflects connection state

- **WHEN** the auto-connect is probing/retrying
- **THEN** the dot is pulsing amber
- **WHEN** connected
- **THEN** the dot is solid green
- **WHEN** incompatible or manual disconnect
- **THEN** the dot is gray or red

### Requirement: Agent settings tab

The Settings modal SHALL include an "Agent" tab that shows: the current connection status with the colored dot, the sidecar endpoint (read-only for V1, sourced from `WORKHORSE_AGENT_ENDPOINT`), a "断开连接" button (visible when connected), and a "重新连接" button (visible when disconnected or in error).

#### Scenario: Viewing Agent settings while connected

- **WHEN** the user opens Settings → Agent tab while connected
- **THEN** the tab shows a green dot, "已连接", the endpoint, session ID, and a "断开连接" button

#### Scenario: Viewing Agent settings while disconnected

- **WHEN** the user opens Settings → Agent tab while disconnected
- **THEN** the tab shows a gray dot, "未连接", the endpoint, and a "重新连接" button

#### Scenario: Disconnecting from settings

- **WHEN** the user clicks "断开连接" in Settings → Agent tab
- **THEN** auto-retry and the heartbeat pause, the dot turns gray, and the "重新连接" button appears

### Requirement: Sidecar launch is the supervisor's job, not auto-connect's

The auto-connect health loop SHALL NOT launch, spawn, or restart any sidecar
process. Its sole responsibility remains probing `GET /health`, verifying
`protocol_version`, and managing reachability state with backoff. When managed
mode is on, the `wsl-managed-sidecar` supervisor is the upstream producer that
ensures a sidecar is being launched into the configured endpoint; auto-connect
then converges the connection exactly as it does for a manually-started sidecar.
The two surfaces stay independent: the auto-connect status dot reflects
*reachability*, while the supervisor status reflects *process lifecycle*.

#### Scenario: Managed launch reuses the existing backoff loop

- **WHEN** managed mode spawns the sidecar and the port is not yet listening
- **THEN** auto-connect's "frontend starts before sidecar" path applies unchanged: probe fails with `transient`, retries with backoff, and marks `connected` once `/health` turns green
- **AND** auto-connect itself does not spawn or restart any process

#### Scenario: Reachability dot and supervisor status are distinct

- **WHEN** managed mode reports `restarting` after a crash
- **THEN** the auto-connect status dot independently reflects reachability (e.g. "connecting…") based only on `/health` probes
