## ADDED Requirements

### Requirement: User message uplink

The renderer SHALL send user chat messages to the active agent session through
the Rust bridge. A `agent_send_message` Tauri command POSTs a
`{type:"user_message", content}` envelope to the session's
`/v1/sessions/{id}/stream` endpoint; the renderer calls it via
`sendAgentMessage(content)`. The renderer makes no direct network call to the
sidecar (the `AGENTS.md` boundary). Sending is permitted only when a session is
attached and connected.

#### Scenario: Sending a message on a connected session

- **WHEN** the user types a message and presses Enter (or clicks send) while the
  status is `connected`
- **THEN** the message is appended to the conversation as a user bubble
- **AND** `sendAgentMessage` POSTs `{type:"user_message", content}` to the active
  session's stream endpoint via the `agent_send_message` command

#### Scenario: Sending is blocked while not connected

- **WHEN** the status is not `connected` (idle, connecting, or error)
- **THEN** the send button is disabled and Enter does not dispatch a message

#### Scenario: No active session

- **WHEN** `sendAgentMessage` is called with no attached session
- **THEN** it returns a validation error and performs no network call

### Requirement: Assistant text streaming

The Rust SSE reader SHALL relay the sidecar's `assistant_text_delta` and
`assistant_text_done` server events to the renderer as the Tauri events
`agent://text/{sessionId}` (payload `{sessionId, delta}`) and
`agent://textdone/{sessionId}` (payload `{sessionId, messageId, stopReason}`).
The renderer SHALL accumulate consecutive deltas into a single assistant message
and reveal the text progressively, rendering it as Markdown.

#### Scenario: Streaming an assistant reply

- **WHEN** the sidecar emits a series of `assistant_text_delta` events for a turn
- **THEN** each delta is relayed on `agent://text/{sessionId}`
- **AND** the renderer appends deltas to one assistant message, revealing them
  with a paced typewriter effect and rendering Markdown

#### Scenario: Completing an assistant reply

- **WHEN** the sidecar emits `assistant_text_done`
- **THEN** the renderer stops the streaming animation for that message, showing
  the full text, and reveals the per-message action row (copy / feedback)

### Requirement: Tool-call visualization

The Rust SSE reader SHALL relay the sidecar's `tool_call_start` and
`tool_call_done` server events as `agent://toolstart/{sessionId}` (payload
`{sessionId, toolCallId, name, input}`) and `agent://tooldone/{sessionId}`
(payload `{sessionId, toolCallId}`). The renderer SHALL render each tool call as
an inline block within the assistant message and flip it from `running` to
`done` when the matching `tool_call_done` arrives, correlated by `toolCallId`.

All relayed payload fields use camelCase (the Rust payloads carry
`#[serde(rename_all = "camelCase")]`); the renderer MUST read `toolCallId`, not
`tool_call_id`.

#### Scenario: A tool call starts and completes

- **WHEN** the agent invokes one of its own tools and the sidecar emits
  `tool_call_start` then later `tool_call_done` with the same id
- **THEN** the renderer shows a tool block in `running` state on start
- **AND** flips the same block (matched by `toolCallId`) to `done` on completion

#### Scenario: tool_call_done carries no output (V1)

- **WHEN** `tool_call_done` arrives
- **THEN** the renderer marks the block `done` without an output payload (the V1
  protocol does not include tool output in this event)

### Requirement: AgentRail live conversation UI

The AgentRail SHALL present a live conversation for the active session: an
empty-state prompt with the composer centered when there are no messages, and a
scrolling message list (user bubbles + assistant Markdown) with the composer
pinned to the bottom once a conversation exists. The list SHALL auto-scroll to
follow new output but yield to manual scroll-up, exposing a scroll-to-bottom
control while the user is scrolled away from the bottom.

#### Scenario: Empty state

- **WHEN** the session has no messages
- **THEN** the AgentRail shows the centered prompt and composer

#### Scenario: Auto-scroll follows streaming output

- **WHEN** new assistant deltas arrive and the user is at the bottom
- **THEN** the view stays pinned to the latest content

#### Scenario: Manual scroll-up pauses auto-follow

- **WHEN** the user scrolls up during streaming
- **THEN** auto-follow pauses and a scroll-to-bottom control appears
- **WHEN** the user clicks it
- **THEN** the view returns to the bottom and resumes following
