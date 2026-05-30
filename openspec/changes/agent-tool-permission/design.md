# Design — agent-tool-permission

## Context

The workhorse-agent sidecar owns a five-decision permission model
(`allow_once`, `allow_session`, `allow_permanent`, `deny`, `deny_permanent`) and a
session state machine that includes `await_perm`. When a tool call is gated, its
`PromptFunc` emits a `permission_request` frame and blocks on the session's
`PermissionAnswers` channel for ~300s. The decision is delivered by POSTing a
`permission_decision` control frame onto the same session stream.

The renderer must not talk to the sidecar directly (AGENTS.md boundary), so both
the inbound prompt and the outbound decision are bridged through Rust, mirroring
the existing send/cancel commands.

## Key Decisions

### D1 — Gate the relay on the `dangerous` field
The sidecar emits **two** frames per gated call:
1. a bare informational frame whose `request_id` is the tool-call id and which has
   no `dangerous`/`reason` fields — it is **not** answerable; and
2. the authoritative prompt carrying a ULID `request_id` plus `dangerous` and
   `reason`.

Answering the first does nothing (its id is not what the `PermissionAnswers`
channel matches). So the Rust relay only emits to the renderer when
`event.get("dangerous").is_some()`, guaranteeing every card the user sees maps to
an answerable request id. The event is published per-session as
`agent://permission_request/{sessionId}` with a camelCase
`PermissionRequestPayload { sessionId, requestId, tool, resource, dangerous, reason }`.

### D2 — Approve with `allow_session`, not `allow_once`
The user asked for "prompt once, remember for this session; only re-ask for
sensitive operations." `allow_session` makes the sidecar cache a session-scoped
rule for that tool, so it stops emitting `permission_request` for subsequent calls
to the same tool — achieving silent-after-first without any client-side cache.
`allow_once` would re-prompt every call and is therefore not used by the card's
allow button. Deny sends `deny` (this turn only), not `deny_permanent`.

### D3 — Sensitivity is the sidecar's job, not the client's
"Re-ask only for sensitive operations" is satisfied entirely by the sidecar's
`DangerousCommandGuard`, which inspects **Bash** command strings and re-prompts on
dangerous ones **overriding any cached allow**. Non-Bash tools and benign Bash are
covered by the D2 session rule. The client adds no allow-list of its own; the
declared-but-unimplemented `tools.default_allowed_tools` config field is not relied
upon. The card simply reflects `dangerous` with a red tone + "敏感操作" badge.

### D4 — Permission is a message part, deduplicated by request id
The prompt renders inline as a `permission` `MessagePart`
(`{ requestId, tool, resource, dangerous, reason, status }`) appended to the last
assistant message (or a new one), rather than a modal. The listener dedupes by
`requestId` so the relay (or a re-delivered frame) cannot stack duplicate cards.
Answering flips the matching part's `status` to `allowed`/`denied` in place, giving
a persistent record in the transcript ("已允许（本次会话记住）" / "已拒绝").

### D5 — Decision crosses through Rust
`sendPermissionDecision(requestId, decision)` invokes the `agent_permission_decision`
command, which POSTs `{type:"permission_decision", request_id, decision}` to
`/v1/sessions/{id}/stream`. No fetch from the renderer.

## Risks / Trade-offs

- **Stale prompt after timeout** — if the user ignores the card past the sidecar's
  ~300s window, the upstream wait expires and a later decision is a no-op. Acceptable
  for V1; the card stays visible but inert. A future enhancement could expire it.
- **Single-session V1** — the listener is bound to the active session id; re-attach
  tears it down with the rest of the session wiring.
