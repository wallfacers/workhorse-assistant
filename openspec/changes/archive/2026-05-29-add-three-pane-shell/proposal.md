## Why

The center pane is already the real product: a multi-terminal workspace that
embeds and drives coding-agent CLIs (S0–S2). The **left** and **right** panes,
however, are still the original AI-Studio sketch — `Sidebar` is a knowledge-base
/ conversation navigator and `RightPanel` is a static document-preview card.
Neither matches the product's actual shape: a desktop shell for **watching and
coordinating coding agents**.

The intended arrangement (confirmed against a wireframe) is:

- **Left — Agent rail:** a task composer (new-task input + model/tools selector),
  a search field, and a task list.
- **Center — terminal workspace:** unchanged (the embedded agent CLIs; the
  bottom prompt in the wireframe is the agent's own TUI rendered inside the PTY,
  not a shell component).
- **Right — work panel:** task details (metadata) + a files tree + a preview
  region (for later file/artifact viewing).

This change delivers the **layout shell only**. The new left/right regions render
**placeholder/mock content** in the existing Workhorse visual language
(`docs/DESIGN.md` tokens, no new palette, no hand-tuned values). Wiring real data
— a filesystem-backed file tree, file/image/PDF/PPT preview, an agent task flow —
is deferred to the MVP roadmap captured in `design.md`.

## What Changes

- **Left:** replace `Sidebar.tsx` with an `AgentRail` — task composer + model/tools
  selector + search + task list, all mock. The knowledge-base tree, conversation
  list, brand block, and user-profile footer are removed. The dark-mode toggle is
  preserved (relocated into the rail; see `design.md` D5).
- **Center:** unchanged. `TerminalWorkspace` keeps its slot. No new prompt bar is
  added (the wireframe's bottom input is the agent CLI's own TUI inside the PTY).
- **Right:** restructure `RightPanel` into three stacked regions — **Task details**
  (mock metadata: access id, tags, created, branch, original prompt), **Files** (a
  mock collapsible file tree), and **Preview** (the existing preview content,
  retained for later artifact viewing). The collapse/expand affordance is kept.
- **Styling:** all new components consume `docs/DESIGN.md` role tokens only;
  `npm run design:lint` stays green; no visual values are hand-tuned.

## Capabilities

### New Capabilities

- `three-pane-shell`: the three-pane application shell — the left Agent rail, the
  center terminal-workspace slot, and the right work panel (task details / files
  tree / preview), expressed as a **presentational layout with placeholder
  content** and the renderer/core boundary (no spawning, no filesystem, no network
  from these panes in this change). Named to avoid collision with the
  `components.app-shell` *visual token* in `docs/DESIGN.md` (which styles the
  window frame, a different concern).

### Modified Capabilities

None at the requirement level. The terminal-workspace capability is untouched —
this change only swaps the panes around it.

## Impact

- **Code (Renderer):** new `src/components/AgentRail.tsx` (replaces
  `Sidebar.tsx`); `RightPanel.tsx` restructured into details/files/preview regions
  plus a small mock `FileTree` component; `App.tsx` left/right slots rewired and
  the dark-mode toggle relocated. `Sidebar.tsx` deleted.
- **Code (Rust):** none.
- **IPC / capabilities:** none. These panes do not call any Tauri command.
- **Dependencies:** none expected (folder/file icons already available via
  `lucide-react`).
- **Persistence:** none. All content is mock.
- **Security:** unchanged. The new panes read no files and spawn no processes;
  the only privileged surface remains the center terminal's existing PTY path.
- **Docs:** `ARCHITECTURE.md` source tree (currently lists `Sidebar.tsx` /
  `RightPanel.tsx`) updated to `AgentRail.tsx` + the new `FileTree.tsx`;
  `docs/FRONTEND.md` component pointers updated for the new shell layer;
  `docs/DESIGN.md` unchanged unless a structural role token is genuinely missing
  (then added + re-exported, never inlined — see `tasks.md` 4.0).
- **Planning:** this OpenSpec change (proposal + design + spec + tasks) serves as
  the exec-plan for this work per `docs/PLANS.md`; no separate
  `docs/exec-plans/active/` file is created (consistent with the S0–S2 changes).
- **Out of scope (MVP roadmap — see `design.md`):** real filesystem-backed file
  tree (Rust `fs_list_dir`), file/image preview, PDF/PPT/browser-style artifact
  viewing, the agent task flow (task → terminal group), model/tools selector and
  search wiring, persistence of tasks.
