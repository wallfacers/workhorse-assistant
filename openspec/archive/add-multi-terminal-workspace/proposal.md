## Why

S0 (`add-embedded-terminal`) delivered a single embedded PTY terminal in the
center pane. The product's core value — watching and coordinating **multiple**
coding agents at once — needs more than one terminal on screen. S1 wraps the S0
`Terminal` in a workspace: tabbed groups, an in-group grid split, and a profile
picker, so the user can run several agents (claude+opus, claude+GLM, codex,
shell) side by side and keep background agents working while looking elsewhere.

This is a **renderer-only** change. It adds no Rust commands and no new IPC: it
composes the S0 `pty_*` commands and per-session `pty://…` events (whose
per-session topics were designed in S0 precisely to make multi-terminal routing
trivial). The left (task center) and right (project info) panes stay scaffold;
they become functional in S2 when the app connects to `workhorse-agent`.

## What Changes

- Add a `terminal-workspace` capability: a center-pane workspace that manages
  multiple terminal **groups** (tabs), each holding one or more terminal
  **panes** laid out in a simple equal-cell grid.
- Add a tab bar: activate a group, close a group, and a `+▾` **profile picker**
  (shell / claude+opus / claude+GLM / codex) that opens a new group.
- Add in-group **split**: add a pane (via the same profile picker), close a
  pane, focus a pane. Panes tile in an auto grid — no drag-to-resize in S1.
- Reuse the S0 `Terminal` as the **leaf**, keyed by a stable pane id. Closing a
  pane unmounts its `Terminal`, whose existing teardown kills the PTY.
- **Inactive groups stay mounted (hidden)** so their agents keep running and
  streaming; only visible panes are sized.
- Replace the single `Terminal` mount in `App.tsx`'s center pane with the new
  `TerminalWorkspace`. Default startup state: one group with one `shell` pane.
- Harden the S0 `Terminal` to skip fit/resize when its container has zero size
  (so hidden panes never `pty_resize(0, …)`), and to refit when shown.

## Capabilities

### New Capabilities
- `terminal-workspace`: multi-terminal management in the center pane — tabbed
  groups, an in-group grid split, profile-picker creation, focus, and the
  background-keeps-running and lifecycle rules. Built entirely on the S0
  `embedded-terminal` command/event contract.

### Modified Capabilities
None at the requirement level. S0's `embedded-terminal` is composed, not
changed; the only S0 code touched is a defensive zero-size guard in `Terminal`
(no behavioural requirement of S0 changes).

## Impact

- **Code (Renderer):** new `src/components/terminal/` —
  `TerminalWorkspace.tsx` (state via `useReducer`), `TabBar.tsx`,
  `ProfileMenu.tsx`, `TerminalGroup.tsx` (the pane grid); a small workspace
  types module. `src/components/Terminal.tsx` gains a zero-size guard.
  `src/App.tsx` center pane mounts `TerminalWorkspace`. No new npm dependency
  (React `useReducer`, no state library).
- **Code (Rust):** none. Reuses S0 `pty_spawn` / `pty_write` / `pty_resize` /
  `pty_kill` and `pty://output|exit/{id}` events.
- **Docs:** `ARCHITECTURE.md` (note the renderer-only workspace layer over the
  S0 IPC); `docs/FRONTEND.md` if component conventions need a pointer. Visual
  styling reuses existing `docs/DESIGN.md` tokens — **no hand-tuned values**;
  `DESIGN.md` is touched only if a genuinely new token is unavoidable.
- **Persistence:** none. Terminals do not survive a reload in S1.
- **Security:** unchanged. No new commands, no new capability grant, no secrets
  in the renderer. Process spawning still happens only in the core via the S0
  profile map.
- **Platforms:** renderer-only; verified on WSL via `tauri:dev`. No Windows
  recompile needed beyond S0.
- **Out of scope:** drag-to-resize / recursive split nesting; tab or pane
  reordering; persistence across reload; making the left/right panes functional;
  orchestration via `workhorse-agent` (S2); conversational profile config (S2+).
