# sse-event-display Specification

## Purpose

Defines how the renderer displays four newly relayed SSE events — subagent lifecycle, context compaction, provider retry, and user interruption — that were previously acknowledged but not surfaced in the UI.

## Requirements

### Requirement: Subagent event display

When the sidecar emits `agent://subagent_event/{sessionId}`, the renderer SHALL append a system-message-style entry to the active session's message list. The entry SHALL display the subagent name and its status (started, completed, errored). The entry SHALL use a muted, compact visual style distinct from user and assistant messages.

#### Scenario: Subagent starts

- **WHEN** a `subagent_event` arrives with a subagent name and status "started"
- **THEN** a compact system entry appears in the message list: "🤖 {name} 开始执行"
- **AND** the entry uses muted styling (`text-on-surface-muted`, smaller font)

#### Scenario: Subagent completes

- **WHEN** a `subagent_event` arrives with a subagent name and status "completed"
- **THEN** the corresponding "started" entry updates to: "🤖 {name} 执行完成"

#### Scenario: Subagent errors

- **WHEN** a `subagent_event` arrives with a subagent name and status "error"
- **THEN** the corresponding entry updates to: "🤖 {name} 执行出错" with error styling

### Requirement: Compaction indicator

When the sidecar emits `agent://compaction/{sessionId}`, the renderer SHALL show a brief indicator in the chat header area. The indicator SHALL display "上下文已压缩" and SHALL auto-dismiss after 3 seconds. The indicator SHALL NOT persist in the message list.

#### Scenario: Compaction event received

- **WHEN** `agent://compaction/{sessionId}` fires for the active session
- **THEN** the chat header shows a temporary indicator: "上下文已压缩"
- **AND** the indicator auto-dismisses after 3 seconds

#### Scenario: Compaction for background session

- **WHEN** `agent://compaction/{sessionId}` fires for a non-active session
- **THEN** no indicator is shown (the event is acknowledged but the UI only reflects the active session)

### Requirement: Provider retry indicator

When the sidecar emits `agent://provider_retry/{sessionId}`, the renderer SHALL show a transient retry indicator in the chat header area. The indicator SHALL display "模型重试中…" and SHALL be cleared when the next `text` or `reasoning_start` event arrives for the same session (indicating the retry succeeded and output resumed). If no output event arrives within 30 seconds, the indicator SHALL auto-dismiss.

#### Scenario: Provider retry during streaming

- **WHEN** `agent://provider_retry/{sessionId}` fires while the session is streaming
- **THEN** the chat header shows "模型重试中…"
- **AND** the existing streaming message's spinner continues

#### Scenario: Retry succeeded — output resumes

- **WHEN** a `text` or `reasoning_start` event arrives after a `provider_retry` event
- **THEN** the "模型重试中…" indicator is cleared immediately

#### Scenario: Retry timeout

- **WHEN** `agent://provider_retry/{sessionId}` fires and no output event arrives within 30 seconds
- **THEN** the "模型重试中…" indicator auto-dismisses

### Requirement: Interrupted turn marker

When the sidecar emits `agent://interrupted/{sessionId}`, the renderer SHALL mark the current streaming assistant message as interrupted. The message's spinner SHALL stop and the message SHALL show an "（已中断）" suffix or equivalent visual marker. The interrupted state SHALL persist in the message list and across session switches.

#### Scenario: User cancels a streaming turn

- **WHEN** `agent://interrupted/{sessionId}` fires while the assistant message is streaming
- **THEN** the message's streaming spinner stops
- **AND** a "（已中断）" marker appears at the end of the message
- **AND** the message is no longer treated as streaming

#### Scenario: Interrupted message persists across switches

- **WHEN** the user switches away from a session with an interrupted message and switches back
- **THEN** the interrupted marker is still visible on that message
