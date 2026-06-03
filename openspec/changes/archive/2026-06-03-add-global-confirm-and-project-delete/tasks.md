## 1. Sidecar endpoint (workhorse-agent — companion change; do first)

- [x] 1.1–1.4 Implemented in `workhorse-agent` change `add-delete-project-endpoint`: `DELETE /v1/projects?workdir=` reuses `manager.DeleteSession` (graceful stop + `PurgeSession` hard delete) over `ListSessionsByWorkdir`; tests + protocol.md updated; `go test ./...` green

## 2. Stacking scale (assistant — DESIGN.md + tokens)

- [x] 2.1 Added "Stacking (z-index) scale" to `docs/DESIGN.md` › Elevation & Depth (modal 50 < confirm 60 < toast 70 < tooltip 80)
- [x] 2.2 Added `--z-*` tokens to the `@theme` block in `src/index.css` (referenced via `z-[var(--z-*)]`)
- [x] 2.3 Migrated `Modal.tsx` and `SettingsModal.tsx` overlays from `z-50` → `z-[var(--z-modal)]` (Tooltip stays topmost; documented as the top tier)

## 3. Global confirmation service (assistant)

- [x] 3.1 `ConfirmProvider` + `useConfirm()` in `src/components/ConfirmProvider.tsx`, `confirm(opts) → Promise<boolean>`
- [x] 3.2 Own overlay at `z-[var(--z-confirm)]`; cancel via button/overlay/Escape, confirm via Enter; danger tone; scroll lock
- [x] 3.3 Mounted once at the app root (`App.tsx`, inside SessionProvider)
- [x] 3.4 Reused existing `common.confirm`/`common.cancel` labels (zh-CN + en-US)
- [ ] 3.5 Unit test deferred — repo has no `@testing-library/react` / component-test precedent (only `src/agent` logic tests); behavior is type-checked + manually verifiable. Revisit if component testing is introduced.

## 4. Migrate existing deletes to the dialog (assistant)

- [x] 4.1 `SessionHeader.tsx` — `confirmingDelete` two-step replaced with `await confirm(...)` → `deleteSession`
- [x] 4.2 `SettingsModal.tsx` — table single-row `doDelete` now confirms via the dialog (previously deleted immediately)
- [x] 4.3 `SettingsModal.tsx` — batch delete replaced `confirmingBatch` banner with `confirm(...)`; success toast kept
- [x] 4.4 No existing component tests referenced the inline flows; suite (48 tests) still green

## 5. Project-delete bridge (assistant — IPC + Rust)

- [x] 5.1 `src-tauri/src/agent/mod.rs` — `delete_project(workdir)` (`ureq` DELETE `/v1/projects?workdir=`), maps 400→validation, 404→not_found (older sidecar), else internal/transient
- [x] 5.2 `src-tauri/src/lib.rs` — `agent_delete_project` command + registered in the invoke handler
- [x] 5.3 `src/ipc/agent.ts` — `deleteAgentProject(workdir)` (returns deleted count); exported from `ipc/index.ts`
- [ ] 5.4 Rust unit test for `delete_project` deferred — bridge HTTP methods here are not individually unit-tested; covered by the sidecar's endpoint tests + `cargo check`

## 6. Project-delete UI + post-delete cleanup (assistant)

- [x] 6.1 `TitleBar.tsx` ProjectSwitcher — per-project hover trash button → `confirm({danger})` → `deleteProject(path)`
- [x] 6.2 `SessionProvider.tsx` — `deleteProject` drops the path from `recentProjects` + localStorage
- [x] 6.3 `SessionProvider.tsx` — if the deleted project is `currentProject`, clears it (re-bootstrap re-seeds from `default_workdir`/picker); `refreshProjects` re-pulls the list
- [x] 6.4 i18n for the project-delete dialog (`project.delete*`, `agent.deleteSessionConfirm`, `sessions.confirmDeleteOne`) in zh-CN + en-US
- [ ] 6.5 Unit tests deferred (see 3.5 — no component-test harness)

## 7. Verification

- [~] 7.1 `npm run lint` — all touched files type-check clean; 4 pre-existing errors remain in `TerminalGroup.tsx` from concurrent motion-animation work (NOT this change)
- [x] 7.2 `npm run design:lint` — 0 errors (10 pre-existing warnings unrelated to the stacking scale)
- [x] 7.3 `cargo check` clean; `npm test` 48/48 green; sidecar `go test ./...` green
