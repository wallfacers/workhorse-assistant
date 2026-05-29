# Design — add-right-panel-tabs

## Context

`add-three-pane-shell` (R0) shipped the right work panel as **three regions
stacked vertically** in a single scrollable column (Task details → Files →
Preview), preceded by a "工作面板" header bar with a bottom border. The R0
design included a quantified density trigger: "at 1280 px, all three region
headings must be reachable without scrolling past Task details — if not, flip to
tabs." Verification confirmed the trigger fires: at typical desktop heights the
Files and Preview headings require scrolling past Task details, so **tabs are the
correct arrangement**.

This change executes that flip. The three regions become three tabs. The outer
header section ("工作面板" + divider) is removed — the panel's position and the
collapse affordance already locate it visually.

```
CURRENT (stacked-scroll)              TARGET (tabbed)
───────────────────────               ───────────────
┌────────────────────┐                ┌────────────────────┐
│ 工作面板        [✕] │ ← remove       │ [目录][信息][预览][✕]│ ← tab bar
│────────────────────│                │────────────────────│
│ ── 任务详情 ──      │                │                    │
│  #id  🏷  📅  ⎇   │  ─→            │  (active tab only) │
│  原始指令...        │                │                    │
│ ── 文件 ──  ↓scroll │                │  目录  → FileTree  │
│  ▸ FileTree        │                │  信息  → metadata  │
│ ── 预览 ──  ↓scroll │                │  预览  → doc card  │
│  [文档卡片]         │                │                    │
└────────────────────┘                └────────────────────┘
```

Repository constraints: renderer-only change; no Rust, no IPC, no new
dependencies; all styling from `docs/DESIGN.md` role tokens (`index.css` runtime
source per R0 D8).

## Decisions

### D1 — Tab labels: 目录 / 信息 / 预览

Three labels, each one or two characters, matching the content they surface:
- **目录** — the Files / FileTree region (directory listing)
- **信息** — Task details (metadata: id, tags, branch, prompt)
- **预览** — Preview card (document preview, artifact viewer at R2–R3)

Alternative considered: 文件 / 详情 / 预览. Rejected — "目录" better signals
"navigate this directory" (future R1 intent); "信息" is shorter and less formal
than "详情". The two-character symmetry also renders more evenly in the tab bar.

### D2 — Collapse button moves into the tab bar's trailing slot

The `PanelRightClose` button currently lives in the removed header row. It moves
to the **right end of the tab bar row**, as a trailing icon-button. This keeps
the affordance immediately visible without adding a new row. The collapsed state
(`PanelRightOpen` in `App.tsx`) is unchanged.

```
┌──────────────────────────────────┐
│  目录   信息   预览           [✕] │  ← single row
└──────────────────────────────────┘
```

### D3 — Default tab: 目录

The Files tree is the most immediately useful region (it grows into a live
directory view at R1). Default to 目录 so the user lands on actionable content.
信息 is secondary context; 预览 is ephemeral.

Tab selection is not persisted in this change (resets to 目录 on reload).
Persistence is deferred to R5 when other session state is addressed.

### D4 — Tab bar visual style: capsule pattern, consistent with AgentRail chat tabs

Tab bar uses the same **segmented-capsule** pattern already present in the
codebase (pill container, active tab gets white bg + shadow in light / neutral-700
in dark). This avoids inventing a new visual component and keeps the right panel
consistent with any tab-style controls elsewhere in the shell. No new palette
values.

Active tab indicator: `bg-white dark:bg-neutral-700 shadow-sm rounded-lg` (active
pill inside the container). Inactive: text-gray-500, hover highlight.

### D5 — Content area: each tab gets full panel height

Each tab's content section is `flex-1 min-h-0 overflow-y-auto` — it expands to
fill the remaining panel height after the tab bar. This is the primary benefit
over the stacked layout: **目录** gets a tall file tree that doesn't compete with
Task details for space.

### D6 — Content moved verbatim, no restructuring

The inner markup of each region (FileTree, metadata rows, Preview card +
disabled action buttons) is lifted out of the stacked layout unchanged. The only
structural change is the container — wrapping each block in a conditional render
(`activeTab === 'xxx'`). This keeps the diff minimal and makes the change easy to
verify.

### D7 — No animation on tab switch (this change)

Tab content switches immediately (no fade/slide). Rationale: animations add
complexity and can mask layout bugs during verification. A subtle crossfade can be
added as a polish pass later without a new OpenSpec change (it's a pure visual
enhancement with no behavioural implications).

## Mock data contracts

No change to the mock data shapes defined in R0:

```ts
type FileNode = { name: string; kind: 'folder' | 'file'; children?: FileNode[] };
type TaskDetails = {
  accessId: string; tags: string[]; created: string;
  branch: string; originalPrompt: string;
};
```

`MOCK_FILE_TREE` and `MOCK_TASK_DETAILS` remain in `right-panel.mock.ts` as-is.

## Risks

- **Tabs feel "IDE-heavy" vs the current scrolled stacking.** Mitigated by D4
  (reuse existing capsule pattern) and D6 (content unchanged) — the tab bar is
  familiar and the content is identical.
- **Collapse button discoverability.** Moving it from a dedicated header row into
  the tab bar's trailing slot reduces its prominence slightly. Accepted: the
  tab bar row replaces the header row 1-for-1 in vertical position; the button
  is still top-right, which is the conventional location.
- **Tab label truncation on narrow panels.** At the minimum panel width (340 px)
  three two-character labels + a close icon fit comfortably; verify at 340 px
  during testing (task 3.1).
