# agent-tool-permission

## Why

The sidecar agent gates certain tool calls behind a permission prompt: it emits a
`permission_request` over the session stream and transitions the session into
`await_perm`, blocking on its `PermissionAnswers` channel for up to 300s waiting
for a decision. Before this change the renderer had no handler for that event, so
a gated tool call hung the turn; the user's next message then hit
`session_busy: session is in state await_perm` and the chat was wedged until the
session timed out.

This change formalises the tool-permission round-trip that unblocks that state:
the agent's request surfaces as an in-chat card, the user's decision routes back
through the Rust bridge, and a single approval is remembered for the session so
only genuinely sensitive operations re-prompt.

## What Changes

- The Rust bridge relays the agent's authoritative `permission_request` SSE frame
  to the renderer and adds a command to send the user's decision upstream.
- The renderer renders a permission card in the message stream (tool, resource,
  reason, dangerous badge) with allow / deny actions, deduplicated by request id.
- Approving sends `allow_session` so the sidecar remembers the tool for the rest
  of the session; subsequent calls to the same tool are silent. Dangerous Bash
  commands always re-prompt via the sidecar's command guard, overriding any cache.
- The renderer never calls the sidecar directly — both the relayed event and the
  decision cross through Rust commands (the AGENTS.md boundary).

## Capabilities

### New Capabilities
- `agent-tool-permission`: the renderer-side tool-permission contract — relaying the
  sidecar's authoritative permission prompt, presenting an in-chat allow/deny card,
  and routing the decision back through the Rust bridge with session-remembered
  approval and always-prompt for sensitive operations.

### Modified Capabilities
<!-- None: this is a new capability. The sidecar's permission model itself is
     owned by the workhorse-agent repo and is not respecified here. -->

## Impact

- `src-tauri/src/agent/mod.rs`: `permission_request` SSE relay (gated on `dangerous`),
  `PermissionRequestPayload` (camelCase), `permission_decision()` method → sidecar
  `/v1/sessions/{id}/stream`.
- `src-tauri/src/lib.rs`: `agent_permission_decision` command registered in the
  invoke handler.
- `src/ipc/agent.ts` + `src/ipc/index.ts`: `sendPermissionDecision()` wrapper and
  the `PermissionDecision` type.
- `src/components/AgentRail.tsx`: `permission` message part, `PermissionCard`,
  `agent://permission_request/{sessionId}` listener, `handlePermission` handler.
- No new dependencies; no renderer→sidecar network calls.
