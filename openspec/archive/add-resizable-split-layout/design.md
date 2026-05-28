# Design — add-resizable-split-layout

## Context

S1 composed N `Terminal` leaves into a group and tiled them in an equal-cell
grid (`cols = ceil(sqrt(n))`, design D5), with no drag and no directional split
("deferred" in S1's own D5). Each pane wore an always-on `h-6` chrome header
(profile label + `+` split + `×` close + count badge). The product goal is a
Termius-faithful split: split a *specific* pane right/down, drag any divider to
resize, and read each pane as a clean "card + content" — but in the project's
quiet dark/light palette, not Termius's colorful per-pane headers.

The hard part is **not** the PTY layer (S0 solved spawning; per-session
`pty://output|exit/{id}` topics mean each leaf self-routes). It is the
renderer-side change from a *flat pane list* to a *binary split tree*, plus
wiring drag-resize without re-mounting any `Terminal` (which would kill its PTY).

Constraints (from `AGENTS.md` / `CLAUDE.md`): renderer-only (no Rust/IPC/cap
change); styling via `docs/DESIGN.md` tokens, no hand-tuned hex; `npm run lint`
and `npm run design:lint` are gates; files stay under ~400 lines.

## Goals / Non-Goals

**Goals:**
- Directional split (right = row, down = column) targeting a specific pane.
- Drag-to-resize any divider; ratios are live (not persisted).
- Clean pane card: no always-on header; controls appear on hover only.
- Hard-coded `Alt+Shift++` (split) / `Alt+Shift+-` (close) on the active pane.
- Dark/light parity using existing tokens; one teal accent for the active pane.
- Preserve S1 invariants: no dangling `activePaneId`/`activeGroupId`; closing the
  last pane closes the group; PTY lifecycle unchanged (leaf keyed by pane id).

**Non-Goals:**
- Per-pane profile picker on split (split inherits the source profile; picker
  stays only for "new group" in the tab bar).
- Pane/tab reordering; layout persistence across reload.
- Configurable / custom keyboard shortcuts (tech debt; hard-coded this round).
- Any change to S0 `Terminal` behavior, Rust, IPC, or capability grants.

## Decisions

### D1 — Group layout becomes a binary split tree (replaces the pane array)

```ts
type LayoutNode = SplitNode | PaneNode;
interface PaneNode  { kind: 'pane'; id: string; profileId: ProfileId; }
interface SplitNode { kind: 'split'; id: string;
                      direction: 'row' | 'column';
                      children: [LayoutNode, LayoutNode]; }
interface Group { id; label; layout: LayoutNode; activePaneId: string; }
```

- **Why a tree, not a flat list + grid:** only a tree expresses "this pane became
  two, side by side" independently of the rest, which is exactly the directional
  split and per-divider resize the product wants. The `√n` grid reflows *all*
  panes on every add — wrong model.
- **Sizes live in the library, not the tree (D2):** `SplitNode` carries no
  `sizes`. `react-resizable-panels` owns ratio state during drag; the tree owns
  only *structure*. Keeps the reducer pure and avoids a second source of truth
  for ratios. **No `autoSaveId` is set** — that prop persists sizes to
  `localStorage`, which contradicts "ratios are live, not persisted"; ratios are
  intentionally ephemeral (reset on reload, same as S1). When persistence is added
  later, snapshot the panel group's sizes then — out of scope now.
- **`id` on `SplitNode` too:** used as the `PanelGroup` `id` and React key (it is
  *not* an `autoSaveId`), to keep the library's bookkeeping and React keys stable
  so a resize never remounts a `Terminal`.

**Reducer actions** (structurally side-effect-free apart from minting
`crypto.randomUUID()` ids, distinct from PTY session ids — same convention as
S1). **The S1 `addPane` action is removed**: appending to a flat list has no
meaning in a tree and would be a back-door around the invariant; every new pane
is created by `splitPane`.
- `splitPane(groupId, paneId, direction)`: find the `PaneNode`, replace it in
  place with a `SplitNode{direction, children:[thePane, newPane]}` where
  `newPane` inherits `thePane.profileId`; set `activePaneId = newPane.id`.
  Because the replacement happens *in the pane's existing slot*, the pane's
  **outer** size (the ratio it held in its parent) is preserved; the library
  divides that slot **50/50** between the two new children by default — so
  splitting a pane that was previously resized keeps the surrounding layout and
  just halves the pane's own area.
- `closePane(groupId, paneId)`: remove the leaf; its parent `SplitNode` collapses
  and the **surviving sibling is promoted** into the parent's slot (root included).
  If the pane was the only leaf in the group → delegate to `closeGroup` (S1 rule).
  If the closed pane was active → reassign `activePaneId` to the **first leaf**
  (in-order) of the surviving subtree.
- `activatePane(groupId, paneId)`: set `activePaneId` (clicking a pane sets DOM
  focus too; we don't force focus beyond the click — S1 risk note carries over).

**Invariant (must hold after every action):** every `Group` has a non-empty
`layout`, exactly one `activePaneId` that resolves to a live `PaneNode`, and no
`SplitNode` has fewer than two children. `closeGroup` keeps S1's right-then-left
neighbour reassignment for `activeGroupId`.

*Rejected:* keeping the flat array and faking direction with CSS — cannot nest or
resize independently. *Rejected:* a global store — one subtree; `useReducer` is
enough (S1 D1 still holds).

### D2 — Render with `react-resizable-panels` (recursive)

`TerminalGroup` renders **two decoupled layers** in one positioned container:

1. **Geometry layer** — the resizable split tree, mapped recursively:
   - `PaneNode` → `<Panel id={node.id} minSize={10}>` wrapping an **empty
     placeholder div** (ref'd for measurement — no terminal inside). `minSize` is
     a **percentage** floor (≈10%) so a divider can't be dragged to an unreadable
     width; a pixel-accurate floor is a later refinement.
   - `SplitNode` → `<Group id={node.id} orientation={row?'horizontal':'vertical'}>`
     with `renderGeometry(children[0])`, `<Separator/>`, `renderGeometry(children[1])`.
   - A **single-pane root renders a bare placeholder, not a `<Panel>`**: the
     library's `Panel` reads group context and throws "Group Context not found"
     outside a `<Group>`, and a lone pane has no sibling to resize against.
   - (Library note: v4 exports `Group`/`Panel`/`Separator` with an `orientation`
     prop — not the older `PanelGroup`/`PanelResizeHandle`/`direction` names.)
2. **Terminal layer** — a flat list `flattenLeaves(layout).map(pane => …)` of
   `<PaneCard>`s (each owning `<Terminal key={pane.id} />`), each absolutely
   positioned over its placeholder's measured rect. Positions are tracked by a
   per-commit `useLayoutEffect` measure pass (catches structural/position shifts)
   plus a `ResizeObserver` on the container and every placeholder (catches divider
   drags, window resizes, and the hidden→shown tab transition), reconciled with an
   equality guard so it converges without a render loop.

- **Why two layers instead of terminals-in-tree:** with `<Terminal>` nested in the
  split tree, splitting a pane turns its `<Panel>` into a `<Group>` — the pane's
  React **parent changes type**, and React keys only match siblings under one
  parent, *not* across a changed ancestor. So the split pane (and a pane collapsing
  back to a single-pane root) would **remount and restart its PTY**. Hoisting every
  `<Terminal>` into one never-restructured, stably-keyed parent makes split/close/
  resize touch only empty placeholders + a keyed reorder, so **no surviving pane —
  including the one being split — ever remounts**. The geometry tree is free to
  remount because its leaves carry no state.
- **Pointer events:** the flat layer container is `pointer-events-none` and only
  the cards are `pointer-events-auto`, so the gaps between cards (where the
  `Separator` handles sit, one layer below) stay grabbable for resizing.
- **Stable `id` on both `Panel` and `Group`** (the node id) keeps the library's
  internal size bookkeeping aligned across splits/collapses. **No `autoSaveId`** —
  ratios are intentionally ephemeral.
- **Component split (keep files small, AGENTS.md):** the clean pane card and its
  hover controls live in a dedicated `PaneCard.tsx`, so `TerminalGroup.tsx` stays a
  thin two-layer renderer well under the ~400-line limit.
- **Hidden-group interaction (S1 D3/D4 preserved):** inactive groups stay mounted
  and `display:none`. A hidden group measures 0, so its cards size to 0 and the S0
  zero-size guard skips `fit()`/`pty_resize(0,…)` until shown, then the
  `ResizeObserver` re-measures and refits. No change to `Terminal` needed.

*Rejected:* CSS Grid `grid-template` with draggable gutters — reintroduces manual
ratio bookkeeping and nested-grid complexity the library already solves.

### D3 — Clean pane card + hover controls (no always-on header)

- The pane card is a rounded container (`rounded-md`) with a 1px outline; the
  terminal fills it (small inset padding only). **No `h-6` header, no label, no
  badge** in the resting state — this is the "纯净卡片 + 内容" the user asked for.
- A **hover overlay** in the top-right corner reveals three icon buttons
  (lucide): `SplitSquareHorizontal` (split right → `splitPane(...,'row')`),
  `SplitSquareVertical` (split down → `splitPane(...,'column')`), and `X`
  (`closePane`). Shown via `opacity-0 group-hover:opacity-100` so the resting
  card is clean. Buttons `stopPropagation` so clicking them doesn't also retarget
  focus unexpectedly.
- **Hover overlay must not fight xterm's pointer handling.** xterm.js owns
  pointer events inside its `.xterm` DOM (text selection, scroll). Two rules keep
  the overlay from interfering:
  1. *Reveal is CSS, not JS.* `group-hover` keys off the **card** element's CSS
     `:hover`, which the browser tracks from pointer geometry regardless of any
     JS `stopPropagation` xterm does on descendants — so the controls reliably
     appear even though xterm consumes events underneath.
  2. *No interception at rest.* The overlay is a **small** top-right cluster
     (not a full-viewport layer) and is `pointer-events-none` at rest, becoming
     `pointer-events-auto` only on `group-hover` (and only on the buttons). So an
     invisible overlay never steals clicks/drags from xterm's selection region;
     only the small revealed corner captures clicks, which is the intent.
- **Active-pane affordance:** the active pane's card border uses
  `primary-container` (teal); inactive cards use `outline`/`outline-dark`. This
  is the *only* color accent (honours DESIGN.md's "one accent per screen").
- **Direction semantics:** "split right" places the new pane to the **right**
  (row); "split down" places it **below** (column). New pane inherits the source
  profile (Non-Goal: no picker).

*Rejected:* a thin minimal always-on title (Termius shows a hostname) — for our
profiles the label is low-value and the user explicitly wants it gone; revisit if
sessions get meaningful names later.

### D4 — Keyboard shortcuts (hard-coded, layout-robust)

A single window-level `keydown` listener in `TerminalWorkspace` (active only when
a group exists) maps:
- `Alt+Shift++` → split the **active pane** of the **active group**. Direction is
  auto: measure the active pane's DOM rect and split along its **longer edge**
  (wider → 'row'; taller → 'column') so panes trend toward square (tmux habit).
- `Alt+Shift+-` → close the active pane.

**Getting the active pane's rect (no ref-map needed):** each `PaneCard` root
carries a `data-pane-id={id}` attribute. The handler resolves the element with
`document.querySelector('[data-pane-id="…"]')` for the current `activePaneId` and
reads `getBoundingClientRect()`. This avoids threading a `Map<paneId, HTMLElement>`
through the recursive renderer; the attribute also documents the pane id in the
DOM for debugging. If the element can't be found (shouldn't happen for an active
pane), fall back to `'row'`.

Matched on `e.altKey && e.shiftKey && e.code === 'Equal'` (the `+`/`=` key) and
`… && e.code === 'Minus'`, **not** `e.key`, so a non-US layout where `+` needs a
different physical key still works. `preventDefault()` on match. The handler reads
the active group/pane from reducer state (closure or ref) and dispatches the same
actions the hover controls use — one code path.

*Rejected:* `e.key === '+'` — brittle across layouts/IME. *Rejected:* binding on
the xterm element — xterm consumes most keys; a window listener with the
Alt+Shift guard does not collide with terminal input.

### D5 — Styling strictly via existing tokens; tab-bar restyle

Cards, dividers, hover controls, and the restyled (flatter) tab bar consume
existing `docs/DESIGN.md` tokens (`surface-muted`/`surface-dark`,
`outline`/`outline-dark`, `primary-container`, the dark neutrals already used in
S1) plus Tailwind utilities — **no hand-tuned hex/spacing**. The resize handle
shows a **faint `outline`/`outline-dark` hairline at rest** (so it is
discoverable and grabbable, and follows the active theme) and tints
`primary-container` on hover/drag. Note `primary-container` (`#0b6477`) is a role
token that does **not** flip between light and dark (DESIGN.md forbids redefining
colors per mode), so the hover tint is identical in both themes — only the rest
hairline differs (`outline` light / `outline-dark` dark). If a genuinely new
token is unavoidable it is added to `DESIGN.md` and re-exported first
(`npm run design:export:css`), never inlined. `npm run design:lint` gates it.

## Risks / Trade-offs

- **A split/close/resize remounts a `Terminal` (kills a live agent)** →
  Mitigation: terminals are not in the restructuring split tree. They live in a
  flat, never-restructured layer keyed by `PaneNode.id`, so a split/close is only a
  keyed reorder + empty-placeholder remount — survivors (including the pane being
  split) keep their identity and PTY. Verified by splitting/closing while an agent
  runs and confirming it survives (and that closing it reaps with no orphan via
  `ps`).
- **A placeholder measuring 0 inside a hidden group spams `pty_resize(0,…)`** →
  Mitigation: the S0 zero-size guard already short-circuits; unchanged. The
  `ResizeObserver` re-measures on the hidden→shown transition. Re-verify the refit
  path with a split layout (not just a single pane).
- **New dependency (`react-resizable-panels`) drift / bundle size** →
  Mitigation: small, typed, widely used (shadcn); pin the current major
  (`^4.11.2`); it replaces hand-rolled drag code we would otherwise own. CSP
  unaffected (no network).
- **`closePane` sibling-promotion bug leaves a dangling `activePaneId`** →
  Mitigation: pure reducer; the no-dangling-id and "first-leaf reassignment"
  invariants are stated in D1 and are the obvious unit-test seams once a test
  runner exists (test runner itself is pre-existing tech debt).
- **`Alt+Shift+±` collides with an OS/browser shortcut** → Mitigation: `e.code`
  guard + `preventDefault`; documented as a hard-coded default with configurable
  shortcuts tracked as tech debt, so a future user remap resolves any clash.

Accepted low-severity (recorded, not fixed this round):
- **Hover overlay briefly points at the old pane during rapid split/close.** The
  reducer is pure (no state race), but the DOM reconciles a frame behind a burst
  of splits/closes, so a hover overlay can target the pre-update pane for a frame.
  Cosmetic only — controls dispatch on the (correct) current `activePaneId`/click
  target, not on stale geometry. Not fixed.

## Migration Plan

Renderer-only and behind no flag. The change swaps `Group.panes` for
`Group.layout` and replaces `TerminalGroup`'s grid with the recursive renderer in
one step; there is no persisted state to migrate (terminals don't survive reload
in S1). Rollback = revert the change set; S0/S1 PTY and IPC contracts are
untouched, so the core needs no redeploy.

## Open Questions

- None blocking. Direction auto-selection for the keyboard split (longer-edge
  heuristic) is a chosen default, not a hard requirement — easy to revisit when
  configurable shortcuts land.
