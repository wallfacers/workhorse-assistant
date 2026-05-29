## Why

The right work panel currently stacks its three regions — **任务详情**, **文件**,
**预览** — vertically inside a single scrolling container, preceded by a header
bar ("工作面板") with a bottom border. Two problems:

1. The header divider adds visual weight that the surrounding shell doesn't need;
   the panel's position and collapse affordance already locate it.
2. All three regions are visible (and scrolled through) at once. On typical
   screen heights the files tree and preview compete for space rather than each
   getting the full panel height.

The intended shape is a **tab-switched panel**: a tab bar at the very top of the
panel (no separate header section above it) lets the user switch between 目录,
信息, and 预览, with only the active tab's content occupying the content area.
This matches the wireframe provided (2026-05-29) and the collaborator's explicit
preference.

## What Changes

- **`RightPanel.tsx`:** remove the outer header `<div>` (the "工作面板" label +
  border-b). Replace the stacked three-region layout with a **tab bar** (目录 /
  信息 / 预览) at the panel's top edge plus a single content area that renders
  only the active tab's content. The collapse affordance (`PanelRightClose`)
  moves into the tab bar's trailing slot. All existing content (FileTree,
  TaskDetails metadata rows, Preview card + action buttons) is retained verbatim
  — only the container structure changes.
- **Styling:** no new palette values; tab bar uses existing Workhorse token
  pattern (surface/outline/on-canvas roles). `npm run design:lint` stays green.
- **Docs:** none — this is a layout restructure within an already-documented
  component.

## Capabilities

### Modified Capabilities

- `three-pane-shell` (spec: `openspec/specs/three-pane-shell/spec.md`): the work
  panel's internal layout requirement is updated — the three regions are now
  tab-switched, not stacked. No new capability is introduced.

## Impact

- **Code (Renderer):** `RightPanel.tsx` only — add a `activeTab` state,
  a tab bar row, conditional rendering per tab, and relocate the collapse button.
  No new files needed.
- **Code (Rust):** none.
- **IPC / capabilities:** none.
- **Dependencies:** none.
- **Persistence:** none (tab selection resets on reload; persistence is deferred).
- **Security:** unchanged.
- **Out of scope:** persisting the active tab across restarts, animating tab
  transitions, real data behind the tabs (deferred to R1–R3 per
  `docs/product-specs/agent-workspace.md`).
