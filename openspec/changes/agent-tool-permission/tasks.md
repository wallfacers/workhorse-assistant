# Tasks — agent-tool-permission

> Recorded retroactively: the implementation landed this session to unblock the
> `await_perm` deadlock. Boxes reflect work already completed and verified.

## 1. Rust bridge — relay the prompt

- [x] 1.1 Add a `PermissionRequestPayload` struct (camelCase) with `sessionId, requestId, tool, resource, dangerous: bool, reason` in `src-tauri/src/agent/mod.rs`
- [x] 1.2 Add a `permission_request` SSE match arm that emits `agent://permission_request/{sessionId}` only when the frame carries a `dangerous` field (suppress the non-answerable informational frame)

## 2. Rust bridge — route the decision

- [x] 2.1 Add `permission_decision(session_id, request_id, decision)` to `mod.rs` posting `{type:"permission_decision", request_id, decision}` to `/v1/sessions/{id}/stream`
- [x] 2.2 Add the `agent_permission_decision` command in `src-tauri/src/lib.rs` and register it in the invoke handler

## 3. IPC wrapper

- [x] 3.1 Add `PermissionDecision` type and `sendPermissionDecision(requestId, decision)` to `src/ipc/agent.ts` invoking `agent_permission_decision` for the active session (no direct sidecar call)
- [x] 3.2 Re-export both from `src/ipc/index.ts`

## 4. Renderer — card + flow

- [x] 4.1 Add a `permission` `MessagePart` variant (`requestId, tool, resource, dangerous, reason, status`) in `AgentRail.tsx`
- [x] 4.2 Add a `PermissionCard` component: tone/badge for dangerous, resource + reason, allow (`allow_session`) / deny (`deny`) actions, resolved state after a decision
- [x] 4.3 Subscribe to `agent://permission_request/{sessionId}`, dedupe by `requestId`, and append the part to the last assistant message (or a new one)
- [x] 4.4 `handlePermission(requestId, decision)` calls `sendPermissionDecision` and flips the matching part's status to `allowed`/`denied`

## 5. Verify & gate

- [x] 5.1 `npm run lint` (tsc --noEmit) passes; `cargo check` for `src-tauri` passes
- [x] 5.2 _(runtime)_ A gated tool call shows the card; allowing unblocks the turn and the same tool stays silent afterwards; the previously-wedged `session_busy / await_perm` path is cleared
- [x] 5.3 `openspec validate agent-tool-permission` passes
