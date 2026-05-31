## Why

The agent chat is **single-session and ephemeral**. `src/ipc/agent.ts` holds one
module-level `active: ActiveSession | null` ("V1 manages a single attached
session. Re-attaching detaches the previous one."), and `AgentRail` keeps its
`messages` in local `useState` — lost on unmount/reconnect. There is no concept
of a **project**, nor of more than one conversation. The renderer has **no chat
persistence at all** (localStorage holds only tiny prefs).

To match the working model of Claude Code / opencode — a **project = a local
path** that holds **many persisted sessions** you can switch between, rename, and
delete — the assistant needs a project/session model, multi-live-session
orchestration, and a sidecar that persists transcripts. The backend already
supports multiple sessions (`src-tauri` `sessions: HashMap`, per-session SSE
reader threads); the bottleneck is purely the renderer's single-session singleton
and single-session UI.

## What Changes

- **Project model.** A project is a local path (the sidecar's `workdir`). The app
  can open multiple projects; the active project is shown and switched in the
  **TitleBar (left)** — currently empty drag region — and scopes the session list.
- **Session model.** Each project holds many sessions. Sessions **persist in the
  sidecar's data directory** (Claude-Code-style layout, keyed by project path).
  The assistant lists / loads / renames / deletes them through new Rust bridge
  commands. The sidecar is the source of truth.
- **Multi-live sessions.** Sessions keep running in the background. Switching
  away from a streaming session does **not** stop or lose its output; switching
  back shows its still-live stream. Implemented by moving chat state **out of
  `AgentRail`** into an app-level store that keeps SSE listeners mounted for the
  set `active ∪ running` sessions.
- **Dismantle the single-session singleton.** `active: ActiveSession | null` →
  `Map<sessionId, ActiveSession>`; every bridge fn takes a `sessionId`; the
  per-session catalog publisher (today a single global) fans out per session.
- **AgentRail header.** Session **title (top-left)** with a session-switcher
  dropdown (session list + "new session"), and a **`⋯` menu (top-right)** for
  rename / delete — mirroring the terminal `ProfileMenu` dropdown pattern
  (`useRef` + `mousedown`-to-close + `absolute z-50`).
- **Remote/WSL forward-compatibility.** Bake in path-namespace-neutral decisions
  now so a later change (`add-wsl-remote`) can run the sidecar in WSL without
  rework. See design §"Remote/WSL forward-compatibility".

## Capabilities

### New Capabilities
- `project-sessions`: project (= path) + multi-session model in the renderer —
  the store, multi-live-session orchestration, session switching, and the
  header/menu UI.
- `agent-session-persistence`: sidecar-owned persistence of session transcripts
  per project path, surfaced to the assistant through new bridge commands
  (list / history / rename / delete / projects).

### Modified Capabilities
- `agent-chat`: conversation state moves from `AgentRail`-local `useState` into
  the app-level session store; the single `active` session becomes one of many.

## Impact

- **Renderer (`src/`)**: new project/session store (App-level context); refactor
  `AgentRail` into a view over the active session; `ipc/agent.ts` singleton →
  `Map`; AgentRail header (title + switcher + `⋯` menu); TitleBar project
  switcher; a Settings field for the agent endpoint.
- **Tauri (`src-tauri/`)**: new bridge commands (`agent_list_sessions`,
  `agent_session_history`, `agent_rename_session`, `agent_delete_session`,
  `agent_list_projects`, and an `agent_open_session` that subscribes to an
  existing id **without creating**); per-session reader threads (already
  supported); per-session catalog publisher.
- **workhorse-agent (separate Go repo)**: persist transcripts per `workdir`,
  session metadata (`title`/`createdAt`/`updatedAt`/`status`), and the
  list/history/rename/delete/projects endpoints. See
  [`workhorse-agent-tasks.md`](./workhorse-agent-tasks.md). Coordinated cross-repo
  per `feedback_multi-agent-git-coordination`.
- **Tech debt**: recorded in
  [`../../../docs/exec-plans/tech-debt-tracker.md`](../../../docs/exec-plans/tech-debt-tracker.md).
- **Out of scope**: WSL remote execution (separate change `add-wsl-remote`);
  re-scoping the terminal by project; multi-window; session sharing/export.
