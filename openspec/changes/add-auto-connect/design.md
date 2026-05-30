## Architecture

```
┌──────────────────────────┐        ┌──────────────────────────┐
│  Frontend (renderer)      │        │  Sidecar (Go)            │
│                           │        │                          │
│  useAgentConnection       │        │  GET /health             │
│    │                      │        │    ↓                     │
│    ├─ probe ──────────────┼──HTTP──▶  handleHealth()          │
│    │  (agent_health_check)│        │    returns:              │
│    │                      │◀─JSON──┤    {ok, version,         │
│    │  verify              │        │     protocol_version,    │
│    │   ↓                  │        │     capabilities}        │
│    │  compatible?         │        │                          │
│    │   ↓ yes              │        │  POST /v1/sessions       │
│    ├─ attach ─────────────┼──HTTP──▶  handleCreateSession()   │
│    │  (agent_attach)      │        │    ↓                     │
│    │                      │◀─JSON──┤    {id: "..."}           │
│    ↓                      │        │                          │
│  status: connected        │        │  SSE stream active       │
└──────────────────────────┘        └──────────────────────────┘
```

## Connection state machine

```
                 mount / reconnect()
                        │
                        ▼
               ┌───────────────┐
         ┌─────│   probing     │◀──── retry timer
         │     │  (connecting) │         (backoff)
         │     └───────┬───────┘
         │             │
         │        ┌────┴─────┐
         │        │ verified? │
         │        └────┬─────┘
         │        no   │   yes
         │     ┌───────┴────────┐
         │     ▼                ▼
   ┌───────────┐      ┌──────────────┐
   │incompatible│      │  attaching   │
   │  (error)   │      │ (connecting) │
   └───────────┘      └──────┬───────┘
       │                      │
       │                 ┌────┴─────┐
       │                 │ success? │
       │                 └────┬─────┘
       │            no   │   yes
       │            ┌────┴────────┐
       │            ▼             ▼
       │    ┌───────────┐  ┌────────────┐
       │    │transient  │  │ connected  │
       │    │(retrying) │  │            │
       │    └─────┬─────┘  └──────┬─────┘
       │          │               │
       │    backoff retry    disconnect()
       │                         │
       │                         ▼
       │                  ┌────────────┐
       │                  │   idle     │
       │                  │ (paused)   │
       └──────────────────┴────────────┘
```

**States:**
- `probing` → calling `agent_health_check`, status = `connecting`
- `incompatible` → protocol mismatch, status = `error`, no retry
- `attaching` → calling `agent_attach`, status = `connecting`
- `transient` → network error, status = `error`, retry with backoff
- `connected` → session active, status = `connected`
- `idle (paused)` → manual disconnect, status = `idle`

**Three failure modes:**
1. **Unreachable** (`transient`) → retry with exponential backoff (1s → 2s → 4s → ... → 30s cap)
2. **Incompatible** (`internal: incompatible`) → stop, show error, no retry
3. **Attach failed** after verified probe → retry (treat as transient, sidecar may be in a bad state)

## Protocol version

The `protocol_version` field is a single string `"1"`. It identifies the wire protocol spoken between the frontend and the sidecar (session creation, SSE events, client message types, tool_use/tool_result correlation). A bump to `"2"` would indicate breaking changes to this protocol.

The frontend hardcodes `EXPECTED_PROTOCOL_VERSION = "1"`. If the sidecar's `protocol_version` does not match, auto-connect stops.

## Capabilities

The `capabilities` array lets the sidecar advertise optional features. For V1 the frontend checks for `"frontend_tools"` — if absent, auto-connect still proceeds but the UI tool surface is not published (the session operates in terminal-only mode).

Known capabilities:
- `"frontend_tools"` — sidecar supports `publish_frontend_tools` / `frontend_tool_result` on `/stream`
- `"external_agents"` — sidecar can generate and run external agent adapters

## Retry strategy

```
attempt  delay
───────  ─────
   0       1s
   1       2s
   2       4s
   3       8s
   4      16s
   5+     30s  (cap)
```

- Reset to 0 on successful connection.
- Cleared on manual disconnect or unmount.
- No jitter for V1 (single client, local network).

## Settings

V1 (this change):
- Endpoint shown read-only in Settings → Agent tab
- Source: `WORKHORSE_AGENT_ENDPOINT` env var (Rust side)
- Display: `http://127.0.0.1:7821` (default) or env override

Future:
- Editable host + port fields
- Multiple endpoints
- Persisted via `tauri-plugin-store` or `localStorage`

## Implementation Notes

- The Rust `agent_health_check` command uses `ureq` (already a dependency) with a 3-second timeout.
- The `GET /health` endpoint is already exempt from bearer auth and Origin checks in the Go sidecar.
- In non-Tauri mode (`isTauri()` returns false), auto-connect does not start — avoids useless retries in the browser dev server.
