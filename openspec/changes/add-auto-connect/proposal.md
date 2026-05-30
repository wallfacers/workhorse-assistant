## Why

The agent bridge currently requires the user to click a manual "连接 Agent" button before the desktop app connects to the workhorse-agent sidecar. This is awkward because:

1. **The user must remember to click** — there is no indication that the sidecar is already running and ready.
2. **Startup order is fragile** — if the frontend starts before the sidecar, the button shows an error. The user must click again later.
3. **No identity verification** — connecting to `127.0.0.1:7821` does not confirm the listener is actually a workhorse-agent sidecar (it could be any process on that port).

## What Changes

- **Auto-connect with probe**: on startup, the frontend automatically probes `GET /health` on the configured endpoint. If the response confirms it is a compatible workhorse-agent (via `protocol_version` and `capabilities`), the frontend proceeds to attach. If unreachable, it retries with exponential backoff (capped at 30 s). If incompatible, it stops and surfaces the mismatch.
- **Enhanced health endpoint**: the sidecar's `GET /health` gains `protocol_version` and `capabilities` fields so the frontend can verify identity and feature compatibility before attaching.
- **Rust health-check command**: a new `agent_health_check` Tauri command performs the `GET /health` call and returns the validated response to the renderer, keeping the "no network from renderer" boundary.
- **Connection status indicator**: the manual connect button is removed from the AgentRail footer and replaced with a small colored dot next to the username. Full connection controls (disconnect / reconnect) move to a new "Agent" tab in the Settings modal.
- **Endpoint configuration**: the endpoint is shown (read-only for V1) in the Settings "Agent" tab, sourced from the `WORKHORSE_AGENT_ENDPOINT` environment variable.

## Capabilities

### New Capabilities
- `agent-auto-connect`: automatic sidecar discovery, health-probe verification, and session attachment with bounded exponential-backoff retry.

### Modified Capabilities
- `agent-bridge-transport`: the Rust bridge gains a `agent_health_check` command that calls `GET /health` before the first `attach`. The `attach` flow is unchanged.

## Impact

- **workhorse-agent (Go repo)**: `GET /health` response gains `protocol_version` (string, semver-ish) and `capabilities` (string array). Backward-compatible — existing consumers that only read `ok`/`version` are unaffected.
- **Rust bridge (`src-tauri/src/agent/mod.rs`)**: new `agent_health_check` command. Registered in `lib.rs`. No `capabilities/default.json` changes.
- **Renderer (`src/`)**: `useAgentConnection` hook rewritten to auto-connect on mount with probe→verify→attach flow. `AgentRail` loses the connect button, gains a status dot. `SettingsModal` gains an "Agent" tab.
- **Out of scope**: multi-endpoint configuration, endpoint editing in settings UI, spawning/supervising the sidecar process.
