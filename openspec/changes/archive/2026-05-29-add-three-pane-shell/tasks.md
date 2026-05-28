# Tasks — add-three-pane-shell

> R0 of the MVP roadmap (see `design.md`). Renderer-only, mock content,
> current Workhorse styling. No Rust, no IPC, no new deps expected.
> Execute groups in order (1→5).
>
> **Mock conventions:** all mock copy is in **Chinese** (match the existing UI);
> mock data lives in component-adjacent `*.mock.ts` files (not inlined in JSX, to
> keep components small — see 1.1) and uses the `FileNode` / `MockTask` /
> `TaskDetails` contracts defined in `design.md`.

## 1. Left — Agent rail

- [x] 1.1 Create `src/components/AgentRail.tsx` (replaces `Sidebar.tsx`). Width and
      chrome match the current left pane (`w-64`, rounded card + outline, theme-aware).
      Props: `{ isDarkMode, setIsDarkMode }` (design D3/D5). **Decomposition rule
      (AGENTS.md #4):** if the rail trends past ~300 lines, extract the composer and
      list into `TaskComposer.tsx` / `TaskList.tsx` so no file approaches the ~400-line
      limit.
- [x] 1.2 Build the **task composer** region: a multi-line "new task" input
      (Chinese placeholder, e.g. "描述一个新任务…") + a model/tools selector row (mock
      chips — a model label and a "工具已启用"-style indicator). Inert: no handlers
      beyond local input state (spec "Composer and search are inert placeholders").
- [x] 1.3 Build the **search** field (single inert filter input, Chinese placeholder)
      and the **task list** (mock `MockTask[]` rows from a `*.mock.ts`, Chinese titles,
      one shown active/selected) (design D3).
- [x] 1.4 Add the **dark-mode toggle** to the rail (footer or header), wired to
      `setIsDarkMode`; confirm it renders in browser dev mode (not gated on Tauri)
      (design D5, spec "Dark-mode toggle works from the rail").
- [x] 1.5 `grep -rn "Sidebar" src` to confirm `Sidebar.tsx` has no importers beyond
      `App.tsx` (its `NavItem`/`CollapsibleNavItem`/`SubNavItem` helpers are
      file-private), then delete `src/components/Sidebar.tsx` and update `src/App.tsx`
      to render `<AgentRail isDarkMode={…} setIsDarkMode={…} />` in the left slot
      (removing the now-unused `Sidebar` import).

## 2. Right — work panel (details / files / preview)

- [x] 2.1 Restructure `src/components/RightPanel.tsx` into a single stacked,
      scrollable column with three regions (design D7); the **collapse control moves
      to the right panel's top header row (right-aligned)** since the old tabs capsule
      that hosted it is gone. Keep `App.tsx`'s re-open affordance (`PanelRightOpen`)
      working, and **restyle that re-open button to the same role-token classes** as
      the panel (it currently uses hand-written `text-gray-*` — M12) (spec "Right
      panel collapses and re-opens").
- [x] 2.2 **Task details** region: mock `TaskDetails` metadata rows (Chinese labels)
      — access id, tags, created date, branch, original prompt — from a `*.mock.ts`,
      styled from role-token classes (design D4).
- [x] 2.3 Create `src/components/FileTree.tsx`: a recursive collapsible tree over a
      **mock** `FileNode[]` (from a `*.mock.ts`; folders + files, lucide
      folder/chevron/file icons, expand/collapse state). No filesystem access (spec
      "File tree nodes expand and collapse"). Mount it as the **Files** region.
- [x] 2.4 **Preview** region: retain the current document-preview content (keep the
      `MonoPath` import — Preview stays, not simplified). Mark its action buttons
      (打开 / 所在位置) **disabled** so the mock does not imply working operations
      (PRODUCT_SENSE "would this surprise a user?"). Do **not** carry over the invalid
      `p-4.5` class (Tailwind has no 4.5 step → silently 0 padding); use a valid token
      spacing. This region is the future home for file/image/PDF/PPT viewing (design
      D4, Roadmap R2–R3).

## 3. Shell wiring & layout

- [x] 3.1 Verify `src/App.tsx`'s three-pane flex container is unchanged in
      structure (left rail · `TerminalWorkspace` center · right work panel) and that
      `TerminalWorkspace` is untouched (design D2).
- [x] 3.2 Verify the right-panel collapse/expand still works end to end after the
      restructure (open → collapse → re-open).

## 4. Styling & tokens

- [x] 4.0 **Token-gap audit (before writing styles):** list the visual roles the new
      components need (rail surface, list-item active state, composer input, chips,
      tree row/hover, region headings). Map each to an **existing role-token utility
      class already used by the retained components** (e.g. `bg-surface`,
      `text-on-canvas`, `border-outline`, `primary-container`, and the
      `components.sidebar` token). Prefer reuse. Only if a *structural* role genuinely
      has no class: add the variable to **`src/index.css`'s `@theme` block** (the
      runtime source — `design:export:css` writes to an unimported file and will NOT
      apply, see design D8) **and** mirror it in `docs/DESIGN.md`. Never inline hex.
- [x] 4.1 Style `AgentRail`, `FileTree`, and the restructured `RightPanel`:
      structural colors/radii/spacing/type from the role-token classes; no hardcoded
      hex/rem. Incidental greys with no role token may follow the same Tailwind-palette
      pattern as the adjacent retained components (tech-debt #5) — do **not** force-close
      #5 here (design D6/D8, spec "Layout copies the wireframe").
- [x] 4.2 `npm run design:lint` → 0 **errors** (it validates `docs/DESIGN.md` only,
      not `.tsx`; the ~8 pre-existing unused-token *warnings* may remain — just don't
      add new errors).
- [x] 4.3 **Manual hardcoded-value check** (since neither `design:lint` nor `tsc`
      scans JSX for hex): expect empty output from
      `grep -rnE 'bg-\[#[0-9a-fA-F]{3,6}' \
      src/components/AgentRail.tsx src/components/FileTree.tsx \
      src/components/RightPanel.tsx` (also any extracted `TaskComposer`/`TaskList`).
      Checks only for hardcoded hex colours (the spec violation that neither linter
      catches). Invalid Tailwind steps like the old `p-4.5` are caught by visual
      inspection and the reviewer.

## 5. Docs & gates

- [x] 5.1 Update `ARCHITECTURE.md`'s source tree: replace the `Sidebar.tsx` entry
      (currently ~line 42) with `AgentRail.tsx` and add `FileTree.tsx`; update
      `docs/FRONTEND.md` component pointers for the new shell layer (`AgentRail`,
      restructured `RightPanel`, `FileTree`); note `Sidebar.tsx` is removed.
- [x] 5.2 `npm run lint` (`tsc --noEmit`) clean and `npm run build` (tsc + vite)
      green.
- [x] 5.3 (browser) `npm run dev` verification: the three-pane shell renders, the
      dark-mode toggle in the Agent rail works, and there is **no blank region from a
      Tauri-only dependency** (browser mode has no `TitleBar`). This is the scenario
      D5 is built around, so it must be checked in the browser, not only in Tauri.
- [x] 5.4 (WSL) `tauri:dev` visual verification: the Agent rail shows
      composer/search/task-list, the right panel shows details/files/preview, the
      file tree expands/collapses, the dark-mode toggle works, and the right panel
      collapses/re-opens. Confirm the center terminal workspace is visually and
      functionally unchanged.
- [x] 5.5 **Keyboard accessibility** (`docs/FRONTEND.md`: all interactive elements
      reachable by keyboard): confirm FileTree folder nodes expand/collapse via
      Tab + Enter/Space, the task list is focusable/navigable, and the dark-mode
      toggle is Tab-focusable and Enter-activatable. Active/selected states must not
      rely on color alone.
- [x] 5.6 **Right-panel density check (design D4 trigger):** at a 1280 px window
      width with the right panel open, confirm the first row of all three regions
      (Task details / Files / Preview) is reachable without scrolling past the
      Task-details region. If not, switch the right panel to a tabbed arrangement
      (details / files / preview) **in this change**.
- [x] 5.7 Run `openspec validate add-three-pane-shell --strict` and fix any errors.
