## ADDED Requirements

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

The Rust bridge SHALL expose a `agent_health_check` Tauri command that performs a `GET /health` request to the configured sidecar endpoint. It returns a typed response `{ok, version, protocol_version, capabilities}` on success, or an `AgentError` on failure (`transient` for network errors, `internal` for unexpected response shapes). The renderer calls this command to verify the sidecar before attaching.

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

### Requirement: Auto-connect with probe–verify–attach flow

The renderer SHALL automatically connect to the sidecar on app startup without requiring manual user action. The connection follows a probe–verify–attach sequence:

1. **Probe**: call `agent_health_check`.
2. **Verify**: check `protocol_version` matches the expected value (`"1"`) and `capabilities` contains `"frontend_tools"`.
3. **Attach**: if verified, call `agent_attach` to create a session.
4. **Retry**: on transient failure (unreachable), retry the entire sequence with exponential backoff starting at 1 s, capped at 30 s.
5. **Stop**: on incompatible response, stop retrying and surface the error. On explicit user disconnect (via Settings), stop retrying.

#### Scenario: Sidecar already running when frontend starts

- **WHEN** the frontend starts and the sidecar is already listening
- **THEN** probe succeeds, verification passes, and attach creates a session within a few seconds
- **AND** the status dot turns green

#### Scenario: Frontend starts before sidecar

- **WHEN** the frontend starts and the sidecar is not yet listening
- **THEN** probe fails with `transient`, the status shows "连接中…"
- **AND** retries continue with backoff until the sidecar appears
- **WHEN** the sidecar starts, the next probe succeeds, verification passes, and attach creates a session

#### Scenario: Sidecar is incompatible

- **WHEN** probe succeeds but `protocol_version` does not match
- **THEN** auto-connect stops, the status shows an error indicating version mismatch
- **AND** no further retries occur until the user opens Settings and clicks "重新连接"

#### Scenario: User manually disconnects

- **WHEN** the user clicks "断开连接" in Settings
- **THEN** the session is detached, retry timer is cleared, and auto-connect pauses
- **AND** the status dot shows idle

#### Scenario: User manually reconnects after disconnect

- **WHEN** the user clicks "重新连接" in Settings after a manual disconnect
- **THEN** auto-connect resumes from the probe step

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
- **THEN** the session is detached, auto-retry pauses, the dot turns gray, and the "重新连接" button appears

## MODIFIED Requirements

<!-- None. The existing agent-bridge-transport capability is unchanged; this adds a parallel capability. -->
