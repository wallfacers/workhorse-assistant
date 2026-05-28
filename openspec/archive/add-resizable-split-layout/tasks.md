# Tasks — add-resizable-split-layout

> Execute groups in order (1→7); the implicit dependency chain is intentional.
> Cross-group dependencies to note if parallelizing: task 5.2 needs the
> `data-pane-id` attribute from task 4.2; task 6.1's `countLeaves` needs the
> tree types/helper from tasks 1.2/2.1.

## 1. Dependency & types

- [x] 1.1 Add `react-resizable-panels@^4.11.2` (current latest major) to
      `package.json` dependencies and `npm install`; confirm it imports under Vite
      (no SSR/`use client` issues).
- [x] 1.2 In `workspaceReducer.ts`, define the split-tree types: `PaneNode`
      (`kind:'pane'; id; profileId`), `SplitNode` (`kind:'split'; id;
      direction:'row'|'column'; children:[LayoutNode,LayoutNode]`),
      `LayoutNode = SplitNode | PaneNode`; change `Group` from `panes: Pane[]` to
      `layout: LayoutNode` keeping `id`, `label`, `activePaneId` (design D1).

## 2. Reducer (split tree)

- [x] 2.1 Add tree helpers: `firstLeaf(node)`, `findPane(node, id)`,
      `countLeaves(node)` (replaces `Group.panes.length` reads), and a pure
      `mapTree`/`replaceNode` used by the actions; ids via `crypto.randomUUID()`,
      distinct from PTY session ids.
- [x] 2.2 Implement `splitPane(groupId, paneId, direction)`: replace the target
      `PaneNode` in place with a `SplitNode{direction, children:[thePane,
      newPane]}` where `newPane` inherits `thePane.profileId`; set
      `activePaneId = newPane.id` (design D1/D3).
- [x] 2.3 Rework `closePane(groupId, paneId)`: remove the leaf, collapse its
      parent `SplitNode`, promote the surviving sibling into the parent slot (root
      included); if it was the group's only leaf, delegate to `closeGroup`; if the
      closed pane was active, reassign `activePaneId` to the surviving subtree's
      first in-order leaf (design D1).
- [x] 2.4 **Remove the `addPane` action** from `WorkspaceAction` and its reducer
      case (all new panes go through `splitPane`); keep `activatePane`,
      `addGroup`, `closeGroup`, `activateGroup`; seed `initWorkspace` with one
      group whose `layout` is a single `shell` `PaneNode` (parity with S1
      default). Verify invariants by inspection: non-empty layout, one live
      `activePaneId`, no single-child `SplitNode`, S1 right-then-left
      `activeGroupId` reassignment preserved.

## 3. Recursive render with resizable panels

- [x] 3.1 In `TerminalGroup.tsx`, replace the `√n` grid with a pure recursive
      `renderNode(node)`: `SplitNode → <PanelGroup direction id={node.id}>` with
      `renderNode(children[0])`, `<PanelResizeHandle/>`, `renderNode(children[1])`;
      `PaneNode → <Panel id={node.id} minSize={10}>` containing the pane card
      (`minSize` is a ~10% floor so a pane can't be dragged below a usable
      terminal width; pixel-accurate floor deferred).
      Put **stable `id` on both `Panel` and `PanelGroup`** (the node id) so the
      library's size bookkeeping and React reconciliation stay aligned across
      splits/collapses. Extract the pane card into its own `PaneCard.tsx`
      (and `PaneHoverControls.tsx` if it grows) so `TerminalGroup.tsx` stays a
      thin recursive renderer under the ~400-line limit (design D2).
- [x] 3.2 Key every `<Terminal key={node.id} profileId={node.profileId} />` by the
      stable pane id so resize/split/close never remounts an unrelated leaf
      (design D2 — the load-bearing key rule that protects live PTYs).
- [x] 3.3 Style the `PanelResizeHandle`: faint `outline`/`outline-dark` hairline
      at rest (discoverable, theme-aware), `primary-container` (teal) tint on
      hover/drag; sizing via tokens, no hand-tuned hex (design D5).

## 4. Clean pane card + hover controls

- [x] 4.1 Remove the always-on `h-6` chrome header (profile label + count badge)
      from the pane; render the pane as a rounded card + 1px outline with the
      terminal filling it (small inset only) (design D3, spec "Clean pane card").
- [x] 4.2 Add a hover overlay in the card's top-right with three lucide icon
      buttons — split-right (`splitPane(...,'row')`), split-down
      (`splitPane(...,'column')`), close (`closePane`) — using
      `opacity-0 group-hover:opacity-100`; buttons `stopPropagation`. Keep the
      overlay a **small** top-right cluster and `pointer-events-none` at rest,
      flipping to `pointer-events-auto` only on `group-hover`, so an invisible
      overlay never steals xterm's text-selection clicks; the `group-hover`
      reveal is pure CSS and works despite xterm consuming pointer events
      underneath (design D3). Add `data-pane-id={id}` to the card root (used by
      the keyboard handler in 5.2).
- [x] 4.3 Active-pane affordance: active pane card border uses `primary-container`,
      inactive uses `outline`/`outline-dark`; clicking a pane dispatches
      `activatePane` and sets DOM focus (design D3, S1 focus rule).

## 5. Keyboard shortcuts

- [x] 5.1 In `TerminalWorkspace.tsx`, add a window `keydown` listener (active when
      a group exists) matching `e.altKey && e.shiftKey && e.code === 'Equal'`
      (split) and `… && e.code === 'Minus'` (close); `preventDefault()` on match
      (design D4).
- [x] 5.2 Split shortcut auto-picks direction along the active pane's longer edge:
      resolve the active pane element via
      `document.querySelector('[data-pane-id="…"]')` (the attribute added in 4.2),
      read `getBoundingClientRect()` (wider → 'row', taller → 'column'; fall back
      to 'row' if not found), and dispatch the same `splitPane`/`closePane`
      actions the hover controls use — one code path (design D4).

## 6. Tab bar restyle & picker simplification

- [x] 6.1 Flatten `TabBar.tsx` styling to read consistently with the clean cards,
      using existing tokens only; **replace `g.panes.length` with
      `countLeaves(g.layout)`** for the per-tab count badge (the `panes` property
      no longer exists) (design D5).
- [x] 6.2 Simplify `ProfileMenu.tsx`/`profiles.ts`: drop the `pane` split variant
      (split no longer prompts); keep the `tab` new-group picker that yields the
      canonical `ProfileId` (spec "Profile selection on creation").

## 7. Docs, debt & gates

- [x] 7.1 Add a tech-debt row to `docs/exec-plans/tech-debt-tracker.md` (Open):
      configurable/custom terminal shortcuts (this round hard-codes `Alt+Shift+±`)
      — `discovered 2026-05-28 in add-resizable-split-layout`.
- [x] 7.2 Update `ARCHITECTURE.md` / `docs/FRONTEND.md` pointers if the split-tree
      renderer layer needs a note; confirm `DESIGN.md` unchanged unless a new token
      was unavoidable (then added + re-exported, not inlined). Where restyling
      naturally maps a `text-gray-*`/`bg-neutral-*` usage onto an existing role
      token, prefer the role token — but do **not** force-close tech-debt #5: the
      remaining greys exist because DESIGN.md has no documented grey scale yet, and
      that scale decision is out of scope here (#5 stays open).
- [x] 7.3 `npm run design:lint` → 0 errors and `npm run lint` (`tsc --noEmit`) →
      clean; `npm run build` (tsc + vite) green.
- [x] 7.4 (WSL) `tauri:dev` verification: split right/down (mouse + `Alt+Shift++`),
      drag dividers to resize, close panes (mouse + `Alt+Shift+-`); confirm a
      running agent in one pane survives splitting/resizing/closing a sibling;
      switch tabs and confirm the hidden→shown split layout refits with no 0-size
      glitch. Check for orphans by **inspecting** `ps` and matching exact
      PIDs/PPIDs of the children the app spawned — do **not** `pkill`/pattern-kill
      `claude`/`codex` (the user runs many long-lived sessions); teardown is the
      app's own `pty_kill` path, and verification only observes it.
      — Operator-confirmed (2026-05-29): all split/resize/close/switch scenarios
      verified interactively.
- [x] 7.5 Run `openspec validate add-resizable-split-layout` and fix any errors.
      (Passes: "Change 'add-resizable-split-layout' is valid".)
