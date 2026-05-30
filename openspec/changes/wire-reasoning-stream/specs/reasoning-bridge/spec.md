## ADDED Requirements

### Requirement: Relay reasoning SSE events to the renderer

The Rust sidecar bridge SHALL recognise the sidecar's `reasoning_start`,
`reasoning_delta`, and `reasoning_end` SSE events and emit corresponding Tauri
events `agent://reasoning_start/{sessionId}`, `agent://reasoning_delta/{sessionId}`,
and `agent://reasoning_end/{sessionId}`. Each payload struct SHALL use
`#[serde(rename_all = "camelCase")]` so the renderer reads camelCase fields,
consistent with the existing text/tool relays.

#### Scenario: A thinking block streams through the bridge

- **WHEN** the sidecar emits `reasoning_start` then several `reasoning_delta` then `reasoning_end` over SSE
- **THEN** the bridge emits `agent://reasoning_start/{sid}`, one `agent://reasoning_delta/{sid}` per delta carrying the thinking text, and `agent://reasoning_end/{sid}`, in order

#### Scenario: Snake_case in, camelCase out

- **WHEN** a `reasoning_delta` SSE frame arrives with the sidecar's snake_case `delta` field
- **THEN** the bridge reads it and emits a payload the renderer consumes as `{ delta }` (camelCase convention), matching the `toolCallId` precedent

### Requirement: Reasoning text only, no signature leakage

The bridge SHALL forward only the thinking text increments. It SHALL NOT emit any
`signature` or redacted `data` field, because the sidecar already excludes those
from reasoning SSE frames; the bridge MUST NOT reconstruct or add them.

#### Scenario: Signature never reaches the renderer

- **WHEN** reasoning events flow through the bridge
- **THEN** no signature or redacted-data value appears in any `agent://reasoning_*` payload

### Requirement: Unknown-event fall-through preserved

Adding reasoning arms SHALL NOT change the bridge's handling of other or unknown
SSE event types; unrecognised events SHALL continue to be ignored silently.

#### Scenario: Other events still pass or drop as before

- **WHEN** the bridge processes the new reasoning arms alongside existing text/tool/error arms
- **THEN** `assistant_text_delta`, `tool_call_start`, `error`, etc. behave exactly as before, and an unknown event type is still a no-op
