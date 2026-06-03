## Why

A **project** should be any local directory the user picks — the way `opencode`
and Claude Code anchor on a directory — not the directory the sidecar process
happened to start in. Today the `workhorse-agent` sidecar fills
`GET /health.default_workdir` from `os.Getwd()` (its launch cwd, e.g.
`D:\develop\python\source\workhorse-agent`). The assistant faithfully adopts that
accidental path as the authoritative default project, so a user with a remembered
project but no sessions there is nagged: *"当前项目下没有会话。Agent 运行在其他目录，
要切换过去吗？"* — pointing them at the sidecar's source tree, which is never a
project they want. The session layer is **already** directory-per-request
(`POST /v1/sessions {workdir}`, sessions keyed by encoded path); only two leftover
points still treat "launch cwd = project."

## What Changes

- **Sidecar `default_workdir` no longer leaks the launch cwd.** When no
  `server.default_workdir` config override is set, `GET /health.default_workdir`
  SHALL fall back to the **user's home directory** (`os.UserHomeDir()`), a stable
  and meaningful default, instead of `os.Getwd()`.
- **`/v1/fs` browse confinement becomes per-session, not global.** The sidecar's
  file-listing guard SHALL confine paths to the **requested session/project
  `workdir`** (mirroring `opencode`'s per-request `Instance.directory` check),
  instead of a single global `cfg.DefaultWorkdir`. Without this, configuring
  `DefaultWorkdir` would `403` any project the user opens elsewhere — directly at
  odds with "any local directory." **BREAKING** (sidecar fs contract): callers
  must pass the project path they are browsing.
- **Assistant project authority is reaffirmed; the mismatch nag is reframed.** A
  remembered project that has zero sessions SHALL surface a *"this project has no
  sessions — open a folder / pick a recent"* affordance, **not** a prompt to
  switch to the sidecar's reported directory. The sidecar's `default_workdir` is
  used only as a cold-start seed when there is **no** remembered project.
- **Session management lists across projects (no project isolation).** The
  Settings → session-management table SHALL show sessions from **all** projects
  with a new **Project** column (the session's `workdir`), instead of only the
  active project — easier to scan and operate on. The sidecar's
  `GET /v1/sessions` (no `workdir` query) SHALL return the store's **full
  persisted** session list (live status overlaid), not just the in-memory
  live sessions it returns today.

## Capabilities

### New Capabilities
<!-- none — behavior lands as deltas on existing capabilities -->

### Modified Capabilities
- `agent-auto-connect`: the `GET /health` contract's `default_workdir` falls back
  to the user's home directory, not the process cwd.
- `project-sessions`: a project with no sessions reframes the empty-state to a
  project-picker affordance (not a "switch to the agent's directory" nag); file
  listing is confined to the active project's `workdir` rather than one global
  default.
- `session-management`: the session table lists sessions across all projects and
  adds a Project column, instead of isolating to the active project.

## Impact

- **workhorse-agent (Go sidecar, sibling repo)** — `internal/api/health.go`
  (`defaultWorkdir()` → home fallback), `internal/api/fs.go` (`isWithinWorkdir`
  scoped to the requested workdir, fs endpoint accepts/derives the project path),
  and `internal/api/sessions.go` (`handleListSessions` no-`workdir` branch returns
  `store.ListSessions` + live overlay). Tracked in `workhorse-agent-tasks.md` and
  the sibling repo's own OpenSpec change, mirroring `add-project-sessions`.
- **workhorse-assistant (this repo)** — `src/session/SessionProvider.tsx`
  (`projectMismatch` empty-state reframe, cold-start adoption only when no
  remembered project, an all-projects session list distinct from the
  active-project switcher list), the `projectMismatch` i18n strings
  (`src/i18n/locales/{en-US,zh-CN}.json`), `src/components/ProjectBrowser.tsx`
  (browse rooted at the active project, not the sidecar default), and
  `src/components/SettingsModal.tsx` (`SessionsSection` gains a Project column and
  consumes the all-projects list).
- **Consistent with** existing `project-sessions` ("SHALL NOT default workdir to
  host cwd") and `wsl-remote` ("cold-start default" already exemplified as a home
  path); this change makes the sidecar honor that intent.
- No new renderer permissions; all privileged work stays in Rust/sidecar.
