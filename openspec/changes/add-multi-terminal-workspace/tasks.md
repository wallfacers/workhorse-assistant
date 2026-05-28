# Tasks — add-multi-terminal-workspace (S1)

## 1. Workspace state & shell
- [x] 1.1 Add a workspace types module (`Workspace` / `Group` / `Pane`, with
      client-side ids distinct from PTY session ids) and a `useReducer` reducer
      handling `addGroup` / `closeGroup` / `activateGroup` / `addPane` (split) /
      `closePane` / `activatePane` (design D1). Enforce the reducer invariants:
      `closePane` of the active pane reassigns `activePaneId` to the first
      remaining pane (last pane → `closeGroup`); `closeGroup` of the active group
      reassigns `activeGroupId` to the right neighbour (else left); `Group.label`
      is fixed at creation and never changes
- [x] 1.2 Create `src/components/terminal/TerminalWorkspace.tsx`: hold the
      reducer, seed the initial state with one group containing one `shell` pane
      (design D6), render the tab bar + the active group, and keep inactive
      groups mounted but hidden (design D3)
- [x] 1.3 Mount `TerminalWorkspace` in the center pane of `src/App.tsx`,
      replacing the single S0 `Terminal`

## 2. Tabs & profile picker
- [x] 2.1 `TabBar.tsx`: one tab per group showing `Group.label` (fixed at
      creation, design D6) plus a pane-count badge when panes > 1; active-tab
      styling via existing tokens, a close (×) per tab, and the `+▾` trigger
- [x] 2.2 `ProfileMenu.tsx` + a single `PROFILE_LABELS: Record<ProfileId,string>`
      map (id→display label, e.g. `claude-glm`→`claude+GLM`). The menu renders
      labels but `onSelect` returns the canonical `ProfileId` (never the display
      string); reused by "new group" and pane "split" (design D6)
- [x] 2.3 Wire add-group (picker → `addGroup`), activate-group (click tab), and
      close-group (× → `closeGroup`: kills that group's panes via unmount and
      activates the right-neighbour group, else left)

## 3. In-group pane grid
- [x] 3.1 `TerminalGroup.tsx`: render the group's panes in an equal-cell grid
      sized by `cols = ceil(sqrt(n))`, `rows = ceil(n/cols)` (design D5); each
      pane wraps `<Terminal key={pane.id} profileId={pane.profileId} />`
- [x] 3.2 Give each pane a chrome with a `+` split button (opens `ProfileMenu` →
      `addPane`) and a `×` close button (→ `closePane`); closing the last pane
      closes the group; closing the last group shows the empty state with a
      "新建终端" prompt (design D5/D6). A split whose `pty_spawn` fails keeps the
      pane showing the S0 inline error (no auto-remove)
- [x] 3.3 Track and show the focused pane (`activatePane` on click sets both
      `activePaneId` and DOM focus; subtle active-pane outline using existing
      tokens) without fighting xterm DOM focus (design D5, risk note)

## 4. S0 Terminal hardening for hidden/multi
- [x] 4.1 In `src/components/Terminal.tsx`, add the zero-size guard (design D4):
      (a) the `ResizeObserver` callback returns early **before** `fit.fit()` when
      `container.clientWidth === 0 || container.clientHeight === 0` (guard before
      fit, not after — `fit()` on 0×0 can throw / set 0); (b) at mount, if the
      container is zero-size, skip the initial `fit()` and call `pty_spawn` with
      no `cols`/`rows` (core default 80×24) — never `pty_spawn(…, 0, 0)`. No
      effect on S0's single-terminal use (its container is never zero-size)

## 5. Docs & verification
- [x] 5.1 Note the renderer-only workspace layer in `ARCHITECTURE.md` (it composes
      the S0 `pty_*` commands / `pty://…` events; adds no Rust, no capability) and
      add any needed component pointer to `docs/FRONTEND.md`
      — Added the "Multi-terminal workspace (renderer-only)" subsection +
      `src/components/terminal/` to the ARCHITECTURE source tree; added the
      `terminal/` pointer to the FRONTEND file-layout block.
- [x] 5.2 Confirm styling used only existing `docs/DESIGN.md` tokens; if a new
      token was unavoidable, it was added to `DESIGN.md` and re-exported (not
      inlined) — otherwise `DESIGN.md` is unchanged
      — Used only existing tokens (`outline`, `surface-muted`, `surface-dark`,
      `surface-dark-elevated`, `primary-container`) + Tailwind default grays as
      the existing components do; no hex literals introduced by S1. `DESIGN.md`
      unchanged; `npm run design:lint` → 0 errors.
- [x] 5.3 `npm run lint` passes
      — `tsc --noEmit` clean; full `npm run build` (tsc + `vite build`) green,
      1700 modules transformed, all new utility classes compiled into the CSS
      bundle.
- [ ] 5.4 (WSL) `tauri:dev`: open ≥2 groups via the picker and split one group
      into ≥2 panes; confirm each terminal runs independently; switch tabs and
      confirm (a) the background group's process keeps running and (b) the
      hidden→shown group refits cleanly to the viewport with no 0-size glitch
      (the merged former task 4.2); close panes/groups and confirm via `ps` that
      the matching children exit with no orphans, and that focus never dangles
      after closing the active pane/group
      — Operator-pending (interactive GUI, batched with the S0 window checks).
      Automatable evidence in place: S1 is renderer-only (no Rust touched), so
      the S0 core — already verified to boot, spawn `/bin/bash` on a real `pts`,
      and reap children with no orphan — is unchanged; the new renderer bundle
      type-checks and builds clean. The reducer invariants that back the
      focus-never-dangles / right-then-left close-group behaviour are pure
      functions covered by design D1. Remaining (needs eyes + clicks): open ≥2
      groups, split, switch tabs, confirm background process keeps running and
      the shown group refits with no 0-size glitch, then `ps` for orphans.
- [ ] 5.5 (operator) Re-confirm on Windows alongside the S0 operator checks
      — Windows baseline CONFIRMED by the operator (2026-05-28): the app builds,
      runs and is responsive with correct rounded chrome / title bar (no native
      Windows chrome), and the startup ConPTY shell spawn no longer hangs the
      GUI thread (async-command fix, commit 9d1cae1; see S0 task 4.7). Still
      open: exercising multi-group / split-pane ConPTY parity on Windows, which
      rides on the interactive checks in 5.4.
