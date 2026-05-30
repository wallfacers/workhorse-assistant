# agent-tool-permission Specification

## ADDED Requirements

### Requirement: Relay the authoritative permission prompt

The Rust bridge SHALL relay the sidecar's tool-permission prompt to the renderer as
a per-session `agent://permission_request/{sessionId}` event carrying the request
id, tool, resource, a `dangerous` flag, and a human-readable reason. When the
sidecar gates a tool call it streams a `permission_request` event and moves the
session into `await_perm`, blocking until a decision is delivered. Because the
sidecar emits both a non-answerable informational frame and the authoritative
prompt, the bridge SHALL relay only the frame that carries the `dangerous` field,
so every relayed prompt maps to an answerable request id. The renderer SHALL make
no direct network call to the sidecar.

#### Scenario: Gated tool call surfaces a prompt

- **WHEN** the sidecar emits a `permission_request` carrying a `dangerous` field for the active session
- **THEN** the Rust bridge publishes `agent://permission_request/{sessionId}` with the request id, tool, resource, dangerous flag, and reason

#### Scenario: Non-answerable frame is suppressed

- **WHEN** the sidecar emits the bare informational `permission_request` frame that has no `dangerous` field
- **THEN** the Rust bridge does not relay it to the renderer

### Requirement: Present an in-chat permission card

A relayed prompt SHALL appear in the message stream as a permission card showing
the tool, the target resource, and the reason, and SHALL mark dangerous requests
distinctly (a sensitive tone and badge). Cards SHALL be deduplicated by request id
so a re-delivered prompt does not stack a duplicate. The card SHALL offer an allow
action and a deny action while pending, and after a decision SHALL show a resolved
state in place rather than a fresh prompt.

#### Scenario: Card renders for a pending prompt

- **WHEN** the renderer receives a relayed permission prompt
- **THEN** a card with the tool, resource, reason, and allow/deny actions is shown in the transcript

#### Scenario: Dangerous request is marked

- **WHEN** the relayed prompt has its dangerous flag set
- **THEN** the card uses the sensitive tone and shows a sensitive-operation badge

#### Scenario: Duplicate prompt is ignored

- **WHEN** a prompt with a request id already shown arrives again
- **THEN** no second card is created for that request id

### Requirement: Route the decision through the Rust bridge

Answering a card SHALL send the user's decision to the sidecar by routing through a
Rust command (`agent_permission_decision`) that posts a `permission_decision`
control frame onto the session stream; the renderer SHALL NOT post to the sidecar
directly. Allowing SHALL send `allow_session` so the sidecar remembers the tool for
the rest of the session, and denying SHALL send `deny` (this turn only). After the
decision the matching card SHALL move to its resolved state.

#### Scenario: Allow remembers for the session

- **WHEN** the user activates allow on a pending card
- **THEN** the bridge sends an `allow_session` decision for that request id and the card shows it was allowed and remembered for the session

#### Scenario: Deny rejects this turn

- **WHEN** the user activates deny on a pending card
- **THEN** the bridge sends a `deny` decision for that request id and the card shows it was denied

### Requirement: Remember approvals, re-prompt only for sensitive operations

After a tool is approved for the session, the sidecar SHALL NOT re-prompt for
subsequent calls to that same tool, so the agent proceeds silently. Sensitive
operations — dangerous Bash commands flagged by the sidecar's command guard — SHALL
re-prompt on every occurrence, overriding any session-remembered approval. The
client SHALL NOT maintain its own allow-list; sensitivity is determined by the
sidecar.

#### Scenario: Approved tool is silent on repeat

- **WHEN** a tool already approved with `allow_session` is invoked again in the same session
- **THEN** the sidecar does not emit a new permission prompt and the call proceeds

#### Scenario: Dangerous command always re-prompts

- **WHEN** the agent invokes a Bash command the sidecar guard flags as dangerous, even if Bash was previously allowed for the session
- **THEN** a new permission prompt is emitted and the user must decide again
