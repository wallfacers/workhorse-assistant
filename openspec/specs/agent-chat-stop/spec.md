# agent-chat-stop Specification

## Purpose
TBD - created by archiving change agent-chat-stream-polish. Update Purpose after archive.
## Requirements
### Requirement: Stop control over a live stream

While the assistant is streaming, the composer's primary button SHALL present a
stop affordance instead of send. Activating stop SHALL perform a real interrupt
of the upstream run by routing a cancel request through the Rust bridge to the
sidecar's `POST /v1/sessions/{id}/cancel` endpoint. The renderer SHALL make no
direct network call to the sidecar (cancel crosses through a Rust command, per
the AGENTS.md boundary).

#### Scenario: Button is Stop while streaming

- **WHEN** at least one assistant message is actively streaming
- **THEN** the composer button shows a stop icon and triggers cancel instead of send

#### Scenario: Button is Send while idle

- **WHEN** no message is streaming
- **THEN** the composer button shows the send affordance and sends the typed message

#### Scenario: Stop interrupts the upstream run

- **WHEN** the user activates stop during streaming
- **THEN** the Rust bridge issues `POST /v1/sessions/{id}/cancel` for the active session and the upstream run is asked to stop

### Requirement: Stop preserves streamed output

Stopping SHALL preserve the text already streamed into the message list. After
stop, the renderer SHALL finalise its local streaming state (clear the streaming
markers and the in-flight delta buffers) so the message is treated as complete,
independent of whether a late `textdone` or the cancel ack arrives first.

#### Scenario: Partial text is kept

- **WHEN** the user stops a run that has already streamed some text
- **THEN** the already-streamed text remains visible and the message is no longer marked as streaming

#### Scenario: Local finalise is race-safe

- **WHEN** stop is activated and a `textdone` or cancel acknowledgement arrives around the same time
- **THEN** the renderer ends in a consistent idle state with no duplicate or dangling streaming markers

