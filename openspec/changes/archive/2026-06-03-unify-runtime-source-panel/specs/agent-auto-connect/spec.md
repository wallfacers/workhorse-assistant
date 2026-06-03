## MODIFIED Requirements

### Requirement: Agent settings tab

The Settings modal SHALL include an "Agent" tab rendered as the unified **「运行来源」** panel (see capability `runtime-source-panel`). The tab SHALL show: a **single** derived connection status with the colored dot (sourced from `supervisor.status` in 本机 modes and from `agent.status` in `Remote` mode), the mode-contingent fields, an editable sidecar `endpoint`, and the unified 「应用」 action. The endpoint SHALL be **user-editable** (no longer read-only): saving validates the value `http(s)://host[:port]` Rust-side and re-probes via reconnect. In 本机 modes the endpoint host is fixed to loopback (only the port is adjustable); in `Remote` mode the full endpoint is editable. `WORKHORSE_AGENT_ENDPOINT` SHALL still seed the initial value when set.

#### Scenario: Viewing Agent settings while connected

- **WHEN** the user opens Settings → Agent tab while connected
- **THEN** the tab shows a single green dot, "已连接"/"运行中", the editable endpoint, and the unified 「应用」 action
- **AND** SHALL NOT show two separate status dots or two separate save buttons

#### Scenario: Viewing Agent settings while disconnected

- **WHEN** the user opens Settings → Agent tab while disconnected
- **THEN** the tab shows a gray/red dot, the editable endpoint, and the unified 「应用」 action

#### Scenario: Editing the endpoint and applying

- **WHEN** the user edits the endpoint to a valid `http(s)://host[:port]` and clicks 「应用」
- **THEN** the value is validated and persisted Rust-side
- **AND** the connection re-probes against the new endpoint

#### Scenario: Invalid endpoint rejected with guidance

- **WHEN** the user enters an endpoint without an `http(s)://` scheme or with an unparseable port
- **THEN** the save is rejected with a message stating the expected form `http(s)://host[:port]`
- **AND** the previously saved endpoint remains in effect

#### Scenario: Disconnecting from settings

- **WHEN** the user clicks "断开连接" in Settings → Agent tab
- **THEN** auto-retry and the heartbeat pause, the dot turns gray, and the reconnect path becomes available
