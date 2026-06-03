## Why

Deleting things is currently inconsistent and incomplete. Sessions can be
deleted via ad-hoc "inline two-step" confirms scattered across components, but
**project records cannot be deleted at all** — `ProjectSwitcher` only opens and
switches. There is no single, predictable confirmation surface, and the inline
confirms have no overlay and no guaranteed layering above modals (e.g. the
Settings modal at `z-50`). We want one global confirmation dialog that every
human-initiated delete flows through, plus the ability to delete a project
record from the switcher.

## What Changes

- **New global confirmation dialog.** A single `ConfirmProvider` mounted at the
  app root exposes an imperative `useConfirm()` → `await confirm({ title, body,
  danger })` Promise API with its own overlay. It renders above all modals.
- **Formal stacking scale.** Introduce a documented z-index/layering scale in
  `docs/DESIGN.md` (e.g. `modal` / `confirm` / `toast`) and export it as Tailwind
  tokens. The confirm dialog sits above the modal layer; today every overlay is
  hand-coded to `z-50`. Per CLAUDE.md, layering values are tokens, not hand-tuned.
- **All human-initiated deletes route through the dialog.** Migrate the existing
  inline two-step confirms to the global dialog:
  - `SessionHeader.tsx` — delete session (`confirmingDelete`)
  - `SettingsModal.tsx` — batch delete (`confirmingBatch`)
  - `SettingsModal.tsx` — sessions-table single-row delete (`doDelete`)
- **New: delete a project record.** `ProjectSwitcher` gains a delete affordance.
  A project record is **derived** from sessions sharing a `workdir`; deleting it
  means hard-deleting all session records for that `workdir`. The on-disk
  directory is **never** touched — the existing "Open project" entry remains, so
  the user can re-open that folder later as a fresh (empty) project.
- **Exemptions (no confirmation).** PTY close (`ptyKill` / `closePane`) stays
  instant. MCP/agent tools (`useAgentProjectTools.ts`: `open_project`,
  `get_current_project`) never trigger the human dialog. This is achieved by
  injecting confirmation only at UI handlers — never inside shared mutation
  functions (`deleteAgentSession`, `openProject`) — so agent and PTY paths bypass
  it naturally.
- **Cross-repo: new sidecar endpoint.** The Go sidecar (`../workhorse-agent`)
  gains `DELETE /v1/projects?workdir=<path>`, which hard-deletes every session
  under that workdir (reusing the manager's graceful stop + `store.PurgeSession`).
  This capability is owned by the agent repo and is tracked as a companion change
  there; this proposal documents it as a dependency.

## Capabilities

### New Capabilities
- `global-confirm-dialog`: An app-level imperative confirmation service
  (`ConfirmProvider` + `useConfirm`) with its own overlay, plus the documented
  stacking scale that guarantees it renders above modals. Defines which deletes
  must use it and which paths (PTY, agent/MCP) are exempt.

### Modified Capabilities
- `project-sessions`: Adds the ability to delete a project record from the
  switcher (hard-delete of all sessions under the `workdir`, directory untouched)
  and the post-delete local cleanup — drop it from `recentProjects` /
  localStorage and, if it was the current project, reset and re-bootstrap to the
  default project.
- `session-management`: Existing session deletes (single + batch) must route
  through the global confirmation dialog instead of inline two-step confirms.

## Impact

- **workhorse-assistant (renderer):** new `ConfirmProvider`/`useConfirm`;
  `docs/DESIGN.md` stacking scale + Tailwind token export; edits to
  `SessionHeader.tsx`, `SettingsModal.tsx`, `TitleBar.tsx` (ProjectSwitcher),
  `SessionProvider.tsx` (post-delete cleanup / re-bootstrap).
- **workhorse-assistant (IPC + Rust):** new `deleteAgentProject(workdir)` in
  `src/ipc/agent.ts`; `agent_delete_project` command in `src-tauri/src/lib.rs`;
  `delete_project` on the bridge in `src-tauri/src/agent/mod.rs` (mirrors
  `delete_session`, `ureq` DELETE).
- **workhorse-agent (Go sidecar — companion change):** `DELETE /v1/projects`
  route + handler; optional `ListSessionIDsByWorkdir` store helper; reuses
  `manager` graceful stop + `store.PurgeSession`. Touches the agent repo's
  `api-protocol` / `session-management` specs.
- **Dependency order:** the sidecar endpoint must ship **before or with** the
  assistant's project-delete path, or `deleteAgentProject` will 404.
- **Not breaking:** purely additive for users; the inline-confirm migration is an
  internal refactor with equivalent user-visible intent (confirm before delete).
