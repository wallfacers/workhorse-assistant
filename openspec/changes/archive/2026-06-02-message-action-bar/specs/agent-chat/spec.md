## MODIFIED Requirements

### Requirement: Assistant text streaming

The Rust SSE reader SHALL relay the sidecar's `assistant_text_delta` and `assistant_text_done` server events to the renderer as the Tauri events `agent://text/{sessionId}` (payload `{sessionId, delta}`) and `agent://textdone/{sessionId}` (payload `{sessionId, messageId, stopReason}`). After streaming completes, the renderer SHALL render a `MessageActionBar` component below the assistant message content, providing copy, like, and dislike functionality.

#### Scenario: A streaming assistant message finishes

- **WHEN** the renderer receives `agent://textdone/{sessionId}` for a message
- **THEN** the message content is finalized and rendered
- **AND** a `MessageActionBar` component SHALL appear below the message with copy, like, and dislike buttons

#### Scenario: Streaming message shows no action bar

- **WHEN** an assistant message is actively streaming
- **THEN** no `MessageActionBar` SHALL be visible for that message
- **AND** the action bar SHALL only appear once streaming completes
