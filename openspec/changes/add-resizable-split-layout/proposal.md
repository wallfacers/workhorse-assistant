## Why

S1 (`add-multi-terminal-workspace`) gave each group an **equal-cell auto grid**
(`cols = ceil(sqrt(n))`) with a per-pane chrome header (profile label + `+`/`×`
buttons + count badge). That layout cannot express a **directional** split
("split right" vs "split down") and cannot be **resized** by dragging — the two
things that make a Termius/tmux/iTerm split feel like a real workspace. The
chrome header is also visually heavy: panes read as boxed widgets, not the clean
"card + content" the product wants.

This change replaces the auto grid with a **resizable, directional binary split
tree** and strips the pane chrome down to a clean card, while keeping the
project's quiet dark/light theme (no colorful per-pane headers). It stays
renderer-only — no new Rust, IPC, or capability grant.

## What Changes

- **BREAKING (renderer state):** a group's panes change from a flat
  `panes: Pane[]` to a **binary split tree** (`SplitNode` /`PaneNode`). The
  reducer gains `splitPane(paneId, direction)`, **removes the `addPane` action**
  (all new panes now go through `splitPane`, so the flat-append path that could
  break the tree invariant is gone), and reworks `closePane` to collapse a split
  node and promote the surviving sibling. The `√n` auto grid is removed.
- **Adapt the pane-count reads:** `Group.panes.length` (used by the tab-bar count
  badge and the old grid) is replaced by a `countLeaves(layout)` helper, since
  `Group.panes` no longer exists.
- Add **directional split**: split the active pane **right** (row) or **down**
  (column); the new pane inherits the source pane's profile.
- Add **drag-to-resize**: every divider between two children is draggable to
  change the split ratio. Introduces `react-resizable-panels` (recursive
  `PanelGroup` / `Panel` / `PanelResizeHandle`).
- Add **clean pane cards**: remove the always-on `h-6` chrome header (profile
  label + count badge). A pane is a rounded card + 1px outline with the terminal
  filling it. Split/close controls (split-right, split-down, close) are hidden by
  default and appear only on hover in the card's top-right corner.
- Add **keyboard shortcuts** (hard-coded defaults, Windows style):
  `Alt+Shift++` splits the active pane (direction auto-chosen along its longer
  edge), `Alt+Shift+-` closes the active pane. Matched on `e.code`
  (`Equal`/`Minus`) so they survive keyboard-layout differences.
- **Restyle the tab bar** to a flatter look consistent with the clean cards
  (existing tokens only).
- **Defer (add back later):** the per-pane profile picker on split (split now
  inherits the current profile; the picker stays only for "new group" in the tab
  bar); pane/tab reordering; layout persistence across reload; **configurable /
  custom keyboard shortcuts** (recorded as tech debt).

## Capabilities

### New Capabilities
None. This evolves the existing `terminal-workspace` capability rather than
introducing a new one.

### Modified Capabilities
- `terminal-workspace`: the **In-group grid split** requirement is replaced by a
  **resizable directional binary-split** requirement; a new **keyboard split
  shortcuts** requirement is added; the **per-pane chrome / clean card** behavior
  is added; the profile-selection requirement is narrowed (picker only on new
  group; split inherits the source profile). Background-session, hidden-pane
  sizing, default/empty-state, and tabbed-group requirements are unchanged.

## Impact

- **Code (Renderer):**
  - `src/components/terminal/workspaceReducer.ts` — `Group.panes: Pane[]` →
    `Group.layout: LayoutNode` (split tree); new `splitPane`; reworked
    `closePane`; preserved no-dangling-id invariants (right- then left-neighbour).
  - `src/components/terminal/TerminalGroup.tsx` — recursive render over the tree
    via `react-resizable-panels`; remove chrome header; add hover controls.
  - `src/components/terminal/TerminalWorkspace.tsx` — `Alt+Shift+±` key handling
    targeting the active pane.
  - `src/components/terminal/TabBar.tsx` — flatter styling.
  - `src/components/terminal/ProfileMenu.tsx` / `profiles.ts` — drop the `pane`
    split variant; keep the `tab` new-group picker.
  - `src/components/Terminal.tsx` — unchanged (the leaf, keyed by pane id; PTY
    lifecycle and zero-size guard intact).
- **Dependencies:** one new npm dependency, `react-resizable-panels`. No state
  library.
- **Code (Rust):** none. Reuses S0 `pty_spawn` / `pty_write` / `pty_resize` /
  `pty_kill` and `pty://output|exit/{id}` events.
- **Styling:** existing `docs/DESIGN.md` tokens only (`surface-muted` /
  `surface-dark`, `outline` / `outline-dark`, `primary-container` for the active
  border). No hand-tuned hex. A genuinely new token (if any) is added to
  `DESIGN.md` and re-exported, never inlined. `npm run design:lint` must pass.
- **Docs:** `ARCHITECTURE.md` / `docs/FRONTEND.md` pointers if the split-tree
  layer needs a note; a tech-debt row in
  `docs/exec-plans/tech-debt-tracker.md` for configurable shortcuts.
- **Persistence:** none. Splits and ratios do not survive a reload (same as S1).
- **Security / platforms:** unchanged. Renderer-only; no new command, capability,
  or secret. Verified on WSL via `tauri:dev`; ConPTY parity unaffected.
- **Out of scope:** per-pane profile picker on split; pane/tab reordering; layout
  persistence; configurable shortcuts; making the left/right panes functional
  (S2); orchestration via `workhorse-agent` (S2).
