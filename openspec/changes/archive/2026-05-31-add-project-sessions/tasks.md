> Status: planning. No code landed yet. Boxes are the implementation checklist;
> the sidecar half is tracked in [`workhorse-agent-tasks.md`](./workhorse-agent-tasks.md).

## 1. Rust bridge: per-session + new commands

- [x] 1.1 Split `attach`: kept `agent_attach` (create = POST /v1/sessions); added
      `agent_open_session(sessionId)` that subscribes an existing id **without**
      creating one (shared `subscribe` helper, idempotent)
- [x] 1.2 `agent_list_sessions(workdir)` → session metadata list (body verbatim)
- [x] 1.3 `agent_session_history(sessionId)` → full transcript
- [x] 1.4 `agent_rename_session(sessionId, title)` (PATCH)
- [x] 1.5 `agent_delete_session(sessionId)` (DELETE + stop local reader)
- [x] 1.6 `agent_list_projects()` → known project paths
- [ ] 1.7 Remove the "default `workdir` to host cwd" fallback (D6.2); require an
      explicit path — **deferred**: flip together with §3.6 project selection so
      auto-connect keeps working at every step
- [x] 1.8 Register all new commands in `generate_handler![]`

## 2. TS bridge: dismantle the singleton

- [x] 2.1 `active: ActiveSession | null` → `Map<sessionId, ActiveSession>` +
      `currentActiveId` pointer
- [x] 2.2 `sendAgentMessage`/`cancelAgentMessage`/`sendPermissionDecision` take an
      optional `sessionId` (defaults to active); `forwardResult`/`publishCatalog`
      already per-session
- [x] 2.3 `setCatalogPublisher` wired once to a **fan-out** publisher
      (`publishToAllSessions`); torn down when the last session detaches
- [x] 2.4 TS wrappers for the new commands (open/list/history/rename/delete/projects)
      + `setActiveSession`/`attachedSessionIds`; re-exported from `ipc/index.ts`

> Verified: `cargo check` ✓, `cargo test` (agent) ✓, `npm run lint` ✓,
> `npm test` (22) ✓. Existing single-session auto-connect behaviour preserved.

## 3. App-level project/session store

- [x] 3.1 `SessionProvider` context: `projects`, `currentProject`,
      live + listed `sessions`, `activeSessionId`, per-session `runtimes`
- [x] 3.2 Moved `messages`/`streaming` into per-`sessionId` `runtimes`; the
      `assistantId`/`delta` scratch into a per-session `scratchRef` map
      (`src/session/{types,events,SessionProvider}.ts[x]`)
- [x] 3.3 SSE listeners (`subscribeSession`) kept mounted for every live session,
      not just the visible one — background sessions keep accumulating
- [~] 3.4 Subscribe rule: currently subscribes **all live sessions** and derives
      `running` from streaming state. The active∪running narrowing pairs with 3.5.
- [ ] 3.5 Eviction: drop buffer + close stream for idle non-active sessions;
      reload via history on revisit — **deferred** (debt row recorded)
- [x] 3.6 Store now **replaces** the bootstrap session on reconnect (tracks it
      via `bootstrapRef`) so the stale id no longer lingers (B3). `decidePermission`
      targets the owning session (C3). `useAgentConnection` deliberately left
      unchanged — see [`../../../docs/exec-plans/completed/2026-06-01-project-aware-agent-connection.md`](../../../docs/exec-plans/completed/2026-06-01-project-aware-agent-connection.md).
      Full health/session decoupling + §1.7 flip moved to `add-wsl-remote`.
- [x] 3.7 Persist `currentProject` in localStorage (active-session pointer: hint
      only, not yet restored)

## 4. UI

- [x] 4.1 `AgentRail` is now a view over the active session's store slice
- [x] 4.2 AgentRail header (`SessionHeader.tsx`): title + session switcher
      dropdown (list + new), mirroring `ProfileMenu`
- [x] 4.3 AgentRail header `⋯` menu: rename (inline) + delete (inline confirm)
- [x] 4.4 TitleBar project switcher (left): known paths + open-path entry
- [~] 4.5 Native folder picker — **substituted** with manual path entry (no
      `tauri-plugin-dialog` installed; a native picker is namespace-mismatched for
      a WSL sidecar anyway). Deferred to `add-wsl-remote`.
- [ ] 4.6 Settings field for the agent endpoint (D6.3) — **deferred** to
      `add-wsl-remote` (needs a Rust endpoint-mutation command + reconnect)
- [x] 4.7 i18n keys for all new strings (zh-CN + en-US): `agent.*Session*`,
      `project.*`

## 5. Tech debt + docs

- [x] 5.1 Debt rows appended to `docs/exec-plans/tech-debt-tracker.md`
- [x] 5.2 Update `AGENTS.md` knowledge map with `src/session/` (follow-up)

## 5b. Review fixes (2026-06-01)

- [x] A1 `SessionHeader` rename was double-firing (Enter/Escape unmount the input
      → trailing `onBlur` re-submits; Escape persisted unconfirmed text). Made
      rename single-shot via a `renameEndedRef` sentinel; Escape now cancels.
- [x] A2 Deleting the last session left a dead-end (header + new-session entry
      vanished with `activeSessionId = null`). `AgentRail` welcome state now shows
      a "new session" button when there is no active session.
- [x] B2 `deleteSession` no longer calls the `setActiveSession` bridge inside a
      `setLiveSessions` updater (StrictMode double-invoke). Next active is computed
      up front, then each piece of state is committed.
- [x] B4 `openProject` now clears the previous project's live sessions / runtimes /
      active id so the switcher does not mix sessions across projects. Bootstrap
      adoption is now once-per-id (`adoptedRef`) so the clear is not undone by the
      adopt effect re-firing on the `currentProject` change.
- [~] B1 subscribe race, B3 reconnect stale session, C1 `tool_call_done` output,
      C3 permission targets active session — annotated in code + tech-debt-tracker;
      deferred (B1/C1 low-likelihood; B3/C3 pair with §3.6). C2 (`open_session`
      returns `()`) accepted — the SSE reader has its own reconnect.

## 6. 验证

- [x] 6.1 `npm run lint` (tsc) 通过 · `npm test` (22) 通过 · `npm run build` 通过
- [x] 6.2 `cargo check` 通过 · `cargo test` (agent) 通过
- [ ] 6.3 真机：两个会话并发流式互不中断（**可对现有 sidecar 验证**）；
      列表/重命名/删除/history 重建（**等 Go 新端点**）
