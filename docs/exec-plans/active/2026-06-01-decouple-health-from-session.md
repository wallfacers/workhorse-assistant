# Exec-plan: Decouple health probe from session creation (D-WSL-4 / B3)

- **Status:** active
- **Started:** 2026-06-01
- **Owner:** assistant
- **Related:** `openspec/changes/add-wsl-remote/design.md` (D-WSL-4),
  `openspec/changes/add-wsl-remote/tasks.md` (B3),
  `docs/exec-plans/completed/2026-06-01-project-aware-agent-connection.md`,
  tech-debt B3.

## Problem

The auto-connect mechanism gets stuck on "连接中…" forever. Root cause is a
self-sustaining loop:

1. `useAgentConnection` conflates *health probe* with *session creation* — on
   mount it probes `/health` **and** eagerly `attachAgentSession('')` (empty
   workdir → Rust `current_dir()` fallback), minting a session before the user
   has chosen a project.
2. The per-session SSE reader (`/v1/sessions/{id}/stream`) fails (new sidecar
   not serving it yet / non-2xx) and after `RECONNECT_MAX_ATTEMPTS` emits
   `agent://connection_failed/{id}`.
3. `useAgentConnection`'s `connection_failed` handler calls `reconnect()`, which
   runs `tryConnect → attachAgentSession()` again — **minting a brand-new
   session** instead of re-opening the existing one. status flaps
   `connecting↔error`, a fresh session id appears, and the sidecar leaks a
   session every cycle. The user only ever sees "连接中…".

## Goal

Make `useAgentConnection` a **pure health probe** and move all session
lifecycle (bootstrap creation + per-session reconnect) into `SessionProvider`.
A dropped stream re-opens the *same* session; it never mints a new one.

## Non-goals

- D-WSL-1 (drop the Rust host-cwd fallback) — stays in add-wsl-remote batch 2;
  cold-start with an empty remembered project keeps today's fallback so
  "open app → chat" still works until `/health default_workdir` lands.
- B2 cold-start precedence (`/health default_workdir`) and B4 (editable
  endpoint) — batch 2.
- Native project picker — batch 2.

## Approach

- **Rust (`agent/mod.rs`)** — make `subscribe` *healing*: a `SessionHandle`
  carries an `alive: Arc<AtomicBool>` that the reader sets `false` immediately
  **before** emitting `connection_failed` and exiting. `subscribe` re-spawns the
  reader when the existing handle is not-alive (race-free: the renderer's reopen
  is ordered strictly after it observes the failed event). An alive reader is
  still a no-op (switching to a live session must not restart its stream).
- **Bridge (`ipc/agent.ts`)** — add `reopenAgentSession(id)`: re-invoke
  `agent_open_session` to heal the Rust reader, leaving the TS listener layers
  intact (no new upstream session).
- **Hook (`ipc/useAgentConnection.ts`)** — strip `attach`/`detach`, drop
  `sessionId` from `AgentConnection`, remove the per-session connection-lifecycle
  listeners. status reflects `/health` only: probe on mount + 30s heartbeat;
  transient → backoff retry; incompatible → error (no retry); manual
  disconnect/reconnect pause/resume the probe.
- **Store (`session/SessionProvider.tsx`)** — replace the "adopt bootstrap"
  effect with:
  - *bootstrap*: when `status==='connected'` and `liveSessions` is empty,
    create one session for `currentProject` (once per project; reset the guard
    when status leaves `connected` so recovery re-bootstraps).
  - *per-session reconnect*: each live session also listens to
    `agent://connection_failed/{id}` → `reopenAgentSession(id)`, bundled into the
    same `subsRef` unlisten set.
- **UI (`AgentRail`, `SettingsModal`, i18n)** — `agent.status.connected` no
  longer interpolates `sessionId`; drop the sessionId display block in Settings.

## Steps

1. Rust: `alive` flag + healing `subscribe`.
2. Bridge: `reopenAgentSession` + barrel export.
3. Hook: pure health probe; remove `sessionId`.
4. Store: bootstrap effect + per-session `connection_failed` reopen.
5. UI + i18n: drop `sessionId` from status string and Settings.
6. `npm run lint` + `cargo check`.

## Risks

- **Bootstrap loop**: a failing attach must not retry forever — guard the
  bootstrap per `currentProject`; manual "new session" covers a failed first
  attempt.
- **Reopen race**: handled by ordering `alive=false` before the failed emit.
- **Disconnect semantics shift**: with the hook owning only health, "disconnect"
  pauses the probe; live sessions' readers are left as-is (cleanup is future
  work). Acceptable for V1.

## Decision log

- 2026-06-01: Took the full decouple (vs. a targeted reconnect-only patch) at the
  user's request; it is the documented D-WSL-4 target and removes the eager
  empty-workdir attach as well. Cold-start `default_workdir` stays deferred.
