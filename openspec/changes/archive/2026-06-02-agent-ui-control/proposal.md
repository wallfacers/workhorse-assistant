## Why

The agent currently runs only as a PTY-embedded CLI (Claude Code / Codex) inside a terminal pane — it cannot perceive or operate the surrounding desktop UI. To deliver the product goal of an agent that can "open any page, read any button's state, and operate any button," the renderer must expose its UI as a set of callable tools, and the existing Go agent (workhorse-agent) must be able to invoke those tools and receive their results.

## What Changes

- **TS UI control surface**: a renderer-side registry that wraps React UI capabilities as agent-callable tools — semantic action tools (e.g. `open_tab`, `run_task`, `focus_pane`), state-introspection tools (e.g. `get_button_state`, `get_open_tabs`), and a generic `data-testid`-based fallback (`click_by_testid`, `read_by_testid`) for long-tail elements not individually registered.
- **Frontend-tool round-trip bridge**: workhorse-agent gains a new "frontend/proxy tool" class whose execution emits a `tool_use` and suspends until the matching `tool_result` returns, correlated by `tool_use_id`, reusing the agent's existing timeout/cancel semantics. The transport has two segments: renderer↔Rust over Tauri commands+events, and Rust↔sidecar over the agent's HTTP+SSE protocol.
- **Dynamic tool registration**: at session start the renderer publishes a tool catalog (name + description + input/output JSON schemas per tool) which workhorse-agent merges into that session's tool surface — no UI tools are hardcoded in Go. The agent session id is allocated by the sidecar. Re-publishing replaces the session's catalog.
- **Rust-proxied transport**: the renderer ↔ workhorse-agent connection is brokered through Tauri Rust commands + Tauri events (mirroring the existing PTY `pty://output` pattern; Rust owns the HTTP/SSE connection to the sidecar), so the renderer makes no direct network/LLM calls — honoring the `AGENTS.md` boundary.

## Capabilities

### New Capabilities
- `ui-control-surface`: renderer-side registries that expose UI actions and state as agent-callable tools, plus a `data-testid` generic fallback, serialized into a session tool catalog.
- `agent-frontend-tools`: workhorse-agent's proxy/frontend tool class + dynamic per-session registration of the renderer's tool catalog, enabling the agent to invoke UI tools and await their results.
- `agent-bridge-transport`: Rust-proxied request/SSE bridge between the renderer and the workhorse-agent sidecar (Tauri command + Tauri event relay), carrying `tool_use` down and `tool_result` up.

### Modified Capabilities
<!-- None. three-pane-shell behavior is unchanged; this layers new capabilities alongside it. -->

## Impact

- **Renderer (`src/`)**: new `src/agent/` (tool registries, catalog serialization) and `src/ipc/agent.ts` (Rust-proxied bridge client + event subscription); UI components gain `data-testid` attributes and register their actions/state.
- **Tauri (`src-tauri/src/`)**: new commands owning the HTTP/SSE connection to the sidecar, attaching a session, publishing the catalog, relaying `tool_result` upstream, and emitting downstream `tool_use` as `agent://tooluse/{sessionId}` Tauri events. Custom commands need no `capabilities/default.json` entries (as with the existing PTY commands).
- **workhorse-agent (separate Go repo)**: new proxy/frontend tool class, `tool_use`/`tool_result` correlation, and a session-scoped dynamic tool registration endpoint. Coordinated cross-repo per `feedback_multi-agent-git-coordination`.
- **Constraint**: renderer makes no direct network/LLM calls (`AGENTS.md`); all sidecar traffic flows through Rust.
- **Out of scope**: vision-based pixel clicking, multi-user, persisting task metadata.
