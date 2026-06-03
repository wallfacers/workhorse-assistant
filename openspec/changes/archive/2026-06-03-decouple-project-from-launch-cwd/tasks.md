## 1. Sidecar contract (workhorse-agent)

> Detailed steps live in `workhorse-agent-tasks.md` (sibling repo). Implemented
> and verified in the sibling repo's own `decouple-project-from-launch-cwd` change.

- [x] 1.1 `default_workdir` falls back to home, not `os.Getwd()` (see agent-tasks §1)
- [x] 1.2 `/v1/fs` confinement follows the request's scoped `root` (see agent-tasks §2)
- [x] 1.3 `GET /v1/sessions` (no `workdir`) returns the full persisted list + live
      overlay, not just live sessions (see agent-tasks §3)

## 2. Assistant — cold-start seed & empty-state reframe

- [x] 2.1 In `SessionProvider.tsx`, adopt `agent.defaultWorkdir` as the active
      project **only** when there is no remembered `currentProject` (cold start);
      a remembered project is never overridden by the sidecar default. (The
      bootstrap effect already gated on `!currentProject`; confirmed + retained.)
- [x] 2.2 Replaced the `projectMismatch` "switch to the agent's directory" nag:
      any local directory is a valid project, so an empty project just starts a
      fresh session (AgentRail shows a neutral "new session" button when there is
      no active session). Removed `projectMismatch`/`agentDefaultWorkdir`/
      `normalizePath` plumbing. **KEPT `agentDistro`** (unify-wsl-distro-source
      consumes it); no runtime/distro hint folded in.
- [x] 2.3 Updated i18n: removed `agent.projectMismatch` / `agent.switchToProject`
      from `en-US.json` and `zh-CN.json`.

## 3. Assistant — project-scoped browsing

- [x] 3.1 In `ProjectBrowser.tsx`, the picker passes the directory being browsed
      as its own `root` (the picker must browse anywhere to choose a project);
      an omitted target falls back to `default_workdir`.
- [x] 3.2 Threaded `root` end-to-end: `fsList(path?, root?)` in `src/ipc/agent.ts`,
      the Rust `agent_fs_list` command + `AgentBridge::fs_list` (adds `&root=`),
      and the agent `open_path` validation in `useAgentProjectTools.ts`.

## 4. Assistant — session management lists across projects

- [x] 4.1 In `SessionProvider.tsx`, exposed `fetchAllSessions()` (calls
      `listAgentSessions('')` → `GET /v1/sessions` with empty workdir = all
      projects), distinct from `listedSessionsMeta` (the switcher stays
      project-scoped).
- [x] 4.2 In `SettingsModal.tsx` `SessionsSection`, consume the all-projects list
      (local `allRows` + `refreshRows`, refetched after rename/delete) and added a
      **Project** column (`projectLabel(workdir)`, full path on hover).
- [x] 4.3 Added i18n key `sessions.columns.project` to `en-US.json` / `zh-CN.json`.

## 5. Verification

- [x] 5.1 `npm run lint` (tsc) green; `vitest run` green except the pre-existing,
      unrelated `src/agent/fallbackTools.test.ts` failure (fails on clean `main`
      too; does not import any changed module). `cargo check` green.
- [ ] 5.2 Manual: cold start with no remembered project lands on home (or the
      picker when no default); a remembered project with zero sessions starts a
      fresh session, no switch nag. *(Needs the desktop app — Windows host.)*
- [ ] 5.3 Manual: open a project outside any configured `DefaultWorkdir` and
      confirm its file tree lists without `403`. *(Needs the desktop app.)*
- [ ] 5.4 Manual: session-management table lists sessions from multiple projects
      with a Project column; rename/delete work cross-project. *(Needs the app.)*
- [ ] 5.5 Update `docs/` if a constraint changed (per AGENTS.md doc-in-same-change
      rule); cross-link from the agent-workspace product spec if wording shifts.
