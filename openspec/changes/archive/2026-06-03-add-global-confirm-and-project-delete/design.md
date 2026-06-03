## Context

The assistant (Tauri + React renderer; `workhorse-assistant`) talks to a Go
sidecar (`../workhorse-agent`) that persists sessions in SQLite. Two facts from
code review shape this design:

1. **A "project" is not a stored entity.** The sidecar has no projects table;
   `GET /v1/projects` (`internal/api/sessions.go:handleListProjects` →
   `store.ListProjects`, `internal/store/sqlite/crud.go`) derives distinct
   `workdir`s that have ≥1 non-deleted session. The renderer additionally keeps a
   local "recents" list in `localStorage` (`workhorse:currentProject`,
   `workhorse:recentProjects`, `SessionProvider.tsx`). `ProjectSwitcher`
   (`TitleBar.tsx`) shows the union, deduped.
2. **Confirmation is ad-hoc.** Deletes use inline two-step confirms with no
   overlay (`SessionHeader.tsx:confirmingDelete`,
   `SettingsModal.tsx:confirmingBatch` and the table `doDelete`). Modals are
   hand-coded to `z-50`; there is no documented stacking scale. `docs/DESIGN.md`
   only documents shadow elevation, not z-order.

Constraints: per CLAUDE.md, visual values (incl. layering) are tokens defined in
`docs/DESIGN.md` and exported to Tailwind, never hand-tuned; the renderer must not
touch the network/filesystem directly (privileged work goes through Rust
commands); the sidecar is the source of truth for sessions/projects.

## Goals / Non-Goals

**Goals:**
- One imperative `useConfirm()` confirmation service rendered above all modals.
- A documented z-index stacking scale (DESIGN.md + Tailwind tokens).
- Delete a project record = hard-delete its sessions in the sidecar; directory
  untouched; local recents cleaned up; re-bootstrap if it was active.
- Route every human-initiated delete through the dialog; keep PTY close and
  agent/MCP tool calls exempt.

**Non-Goals:**
- No filesystem deletion of the project directory.
- No undo/restore UI for deleted sessions (hard delete is final at the UI level).
- No stacking/queueing of multiple simultaneous confirm dialogs.
- No change to session *soft*-delete semantics for single/batch session deletes
  (those keep using `deleteAgentSession`); only project delete is a hard purge.

## Decisions

### D1 — Imperative `useConfirm()` over declarative `<ConfirmDialog>`
A `ConfirmProvider` at the app root holds one dialog instance and exposes
`confirm(options): Promise<boolean>` via context. Call sites do `if (await
confirm({...})) { ...delete... }` — no per-call JSX or local open-state.
**Why:** "confirm before delete" is inherently imperative; a single instance
guarantees consistent styling and layering. **Alternative:** a declarative
component per call site — rejected for boilerplate and drift (exactly the
inconsistency we are removing).

### D2 — Confirmation lives at UI handlers, never in shared helpers
The `confirm()` gate is placed in click handlers only. Shared mutation helpers
(`deleteAgentSession`, `openProject`, the new `deleteAgentProject`) stay
confirm-free. **Why:** this is what makes the exemptions fall out for free —
PTY close (`ptyKill`/`closePane`) and agent/MCP tools (`useAgentProjectTools.ts`)
call helpers/IPC directly and thus never see the human dialog. **Alternative:**
gate inside helpers with a "skipConfirm" flag — rejected; it would entangle agent
and human code paths and risk blocking the agent.

### D3 — Project delete = hard-purge sessions by workdir (no new entity)
Since a project is derived from sessions, deleting it means removing all its
sessions. The user chose **hard delete**: the sidecar adds
`DELETE /v1/projects?workdir=<path>` whose handler lists the workdir's sessions,
gracefully stops each running one via the existing `manager` (mirroring
`handleDeleteSession`), then hard-deletes each via the existing
`store.PurgeSession` (`DELETE FROM sessions` + cascade to messages/events/
tool_calls). A `store.ListSessionIDsByWorkdir` helper may be added.
**Why:** reuses existing graceful-stop + purge machinery; no schema change; the
project vanishes from `/v1/projects` automatically once its last session is gone.
**Query param `?workdir=`** matches the existing `GET /v1/sessions?workdir=`
convention and avoids encoding a filesystem path into a path segment.
**Alternative:** soft delete (`deleted_at`) — rejected per user; nothing in the
DB would meaningfully retain a deletable "project" and the user wants the record
gone.

### D4 — Stacking scale in DESIGN.md → Tailwind tokens
Add an explicit layering scale to `docs/DESIGN.md` (e.g. `base` / `modal` /
`confirm` / `toast`/`tooltip`) and export it as Tailwind z-index tokens. The
Settings modal and other overlays move from raw `z-50` to the `modal` token; the
confirm dialog uses the `confirm` token (above `modal`). Tooltip's existing
`z-[9999]` folds into the top tier. **Why:** CLAUDE.md forbids hand-tuned visual
values; a scale prevents the current "everything at z-50" pile-up.

### D5 — Cross-repo split into two OpenSpec changes
The sidecar endpoint is a capability of `workhorse-agent` and belongs in that
repo's `openspec` (touching its `api-protocol` / `session-management` specs). This
change owns the renderer + IPC + Rust bridge call; a companion change in
`../workhorse-agent` owns the HTTP endpoint + store helper. **Dependency order:**
the sidecar endpoint must ship before/with the assistant's project-delete path or
`deleteAgentProject` returns 404.

## Risks / Trade-offs

- **Sidecar endpoint not yet present** → `deleteAgentProject` would 404.
  Mitigation: land the agent-repo companion change first (or behind the same
  release); the Rust `delete_project` maps a sidecar 404/4xx to a typed error the
  UI can surface instead of silently failing.
- **Hard delete is irreversible** → accidental loss of all sessions in a project.
  Mitigation: danger-styled confirm dialog with explicit "irreversible" copy and
  the project's session count in the body.
- **Migrating inline confirms changes tested behavior** → existing
  `session-management` scenarios reference the inline two-step. Mitigation: spec
  deltas update those scenarios; update/adjust the related component tests in the
  same change.
- **Graceful-stop of many running sessions on project delete could be slow** →
  the handler stops sessions sequentially. Mitigation: acceptable for the typical
  small session count; reuse the existing per-session graceful-shutdown timeout.
- **localStorage and sidecar can disagree** (a recent that no longer has sessions)
  → after delete we clean recents directly; the union view already tolerates a
  recent with no sidecar match.

## Migration Plan

1. Agent repo (companion change): add `DELETE /v1/projects?workdir=` + store
   helper; ship/release the sidecar.
2. Assistant: add stacking tokens (DESIGN.md + Tailwind), `ConfirmProvider` /
   `useConfirm`, mount at app root.
3. Assistant: migrate `SessionHeader`, `SettingsModal` (batch + table row) to
   `useConfirm`; remove inline two-step state.
4. Assistant: add `deleteAgentProject` IPC + `agent_delete_project` Rust command +
   `bridge.delete_project`; wire `ProjectSwitcher` delete entry through
   `useConfirm`; add post-delete recents cleanup + re-bootstrap in
   `SessionProvider`.
5. Rollback: feature is additive; revert renderer commit to restore inline
   confirms. The sidecar endpoint is harmless if unused.

## Open Questions

- Final token names/order for the stacking scale (e.g. `z-modal` / `z-confirm` /
  `z-toast`) — to be fixed when editing DESIGN.md.
- Should the project-delete confirm body show the session count (requires the
  switcher to know it; `AgentProjectMeta.sessionCount` is available for
  sidecar-sourced projects but not for local-only recents)?
- Exact error copy when `deleteAgentProject` fails because the sidecar is an older
  build without the endpoint.
