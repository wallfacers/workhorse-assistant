# Project-aware agent connection (§3.6 + B3/C3)

- **Status:** in-progress
- **Owner:** wallfacers
- **Created:** 2026-06-01
- **Closed:** —

## Problem

`useAgentConnection` conflates two concerns: *is the sidecar reachable* and
*which session am I talking to*. On mount it probes `/health` then immediately
`attachAgentSession()` (creates a session); on `connection_failed` it calls
`reconnect()` → `tryConnect()` → `attachAgentSession()` **again**, minting a
*new* session each time. After the multi-live refactor (`attach` no longer
detaches), the dead session id lingers in the bridge `Map` and the switcher
(**B3**, `src/ipc/useAgentConnection.ts:132,182,226`). Separately,
`decidePermission` routes a permission answer to the *active* session, so a
prompt raised in A but answered after switching to B mis-targets
(**C3**, `src/session/SessionProvider.tsx`).

## Goal

Make `useAgentConnection` a pure sidecar-health probe; let `SessionProvider`
own all session lifecycle (create / re-open / connection-recovery), so a
reconnect re-subscribes the existing session instead of minting a new one, and
permission answers go to the session that owns the request.

## Non-goals

- **§1.7** (drop the Rust host-cwd `workdir` fallback): stays deferred to
  `add-wsl-remote`. Removing it now would break the zero-config "open app →
  start chatting" flow, because there is no project picker / `/health` cwd yet
  to supply an explicit path. Keeping the fallback lets the bootstrap session
  still attach with an empty workdir. (Decision log.)
- Memory eviction (§3.5), terminal re-scoping (D4), native folder picker, WSL.
- Per-session connection *indicators* in the UI — recovery happens silently;
  only the global sidecar dot stays.

## Approach

- **`useAgentConnection` → health only**: keep `/health` probe-on-mount +
  30 s heartbeat + backoff; drop `attachAgentSession`, the per-session
  `connection_*` listeners, and `sessionId` from its surface. Expose
  `{ status, error, reconnect, disconnect }`.
- **`SessionProvider` owns the bootstrap**: a new effect creates the first
  session via `newSession()` when `agent.status === 'connected'` and there is
  no live session (replaces the `agent.sessionId` adoption effect).
- **Recovery without re-create (B3)**: `SessionProvider` listens to
  `agent://connection_failed/{id}` per live session; on failure it
  `openAgentSession(id)` (re-subscribes the *same* id) rather than creating a
  new one. `connection_lost/restored` are already handled by the Rust reader.
- **Permission ownership (C3)**: stamp each `permission` part with its
  `ownerSessionId`; `decidePermission(requestId, decision)` looks up the owner
  across `runtimes` instead of assuming the active session.

## Steps

- [ ] 1. `useAgentConnection`: strip `attachAgentSession`, per-session
      `connection_*` listeners, and `sessionId`; expose health-only surface.
      Update `AgentConnection` type + `statusTitle` in `AgentRail`.
- [ ] 2. `SessionProvider`: replace the adopt effect with a connected→bootstrap
      effect (`newSession()` when connected and zero live sessions); remove
      `adoptedRef` reliance on `agent.sessionId`.
- [ ] 3. `SessionProvider`: per-live-session `connection_failed` listener →
      `openAgentSession(id)` re-subscribe (B3). Add to the existing subscribe
      effect or a sibling effect keyed on live ids.
- [ ] 4. C3: add `ownerSessionId` to the permission `MessagePart`
      (`src/session/types.ts`, set in `events.ts`); `decidePermission` resolves
      the owner from `runtimes` and targets that session.
- [ ] 5. Reconcile bridge `detach`/reconnect semantics; ensure `disconnect()`
      tears down all live sessions cleanly (not just a bootstrap one).
- [ ] 6. Docs: tech-debt-tracker (B3/C3 → closed), `add-project-sessions`
      tasks.md (§3.6 done), AGENTS.md if the connection contract moved.
- [ ] 7. `npm run lint` + `npm test` + `cargo check`; move this plan to
      `completed/` in the closing commit.

## Risks

- **Startup regression**: if the connected→bootstrap effect misfires, the app
  opens with no session and no way in. Mitigation: the A2 welcome "new session"
  button is the manual fallback; verify the effect fires once.
- **Double-create race**: connected event + a stale live session could both try
  to create. Mitigation: guard on `liveSessions.length === 0` and a creating-ref.
- **Reconnect storm**: `connection_failed` re-open looping if the sidecar stays
  down. Mitigation: re-open is a one-shot per failure event; the Rust reader's
  own backoff governs retry cadence.
- Rollback: revert the commit; `main` retains the working multi-live build.

## Decision log
- 2026-06-01 — Keep the Rust host-cwd fallback (§1.7 deferred): an explicit
  workdir requires a project picker / `/health` cwd that does not exist yet;
  forcing it now breaks zero-config startup. §1.7 moves wholesale to
  `add-wsl-remote`.
- 2026-06-01 — Bootstrap session owned by `SessionProvider`, not the connection
  hook: a single concern (health) per hook; session count is a store concern.
