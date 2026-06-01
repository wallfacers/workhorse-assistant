## ADDED Requirements

### Requirement: Reasoning message part

The AgentRail message model SHALL include a `reasoning` part on assistant
messages. On `agent://reasoning_start`, a reasoning part SHALL be opened on the
current assistant message; each `agent://reasoning_delta` SHALL append its text to
that part; `agent://reasoning_end` SHALL mark it complete. The reasoning part
SHALL render before the assistant's text/tool parts that follow it.

#### Scenario: Deltas accumulate into one reasoning part

- **WHEN** a `reasoning_start`, three `reasoning_delta`s, and a `reasoning_end` arrive for the current assistant message
- **THEN** the message shows a single reasoning part containing the concatenated delta text, marked complete

#### Scenario: Reasoning precedes the answer

- **WHEN** reasoning events are followed by `assistant_text_delta` events
- **THEN** the reasoning section renders above the assistant's answer text in the same message

### Requirement: Collapsible thinking section

Reasoning SHALL render as a collapsible section, default collapsed. While the
reasoning part is streaming, the header SHALL show an active "thinking" indicator;
once complete, it SHALL show a static label (e.g. a thought-duration). Toggling the
header SHALL expand/collapse the reasoning body.

#### Scenario: Streaming then settled header

- **WHEN** the reasoning part is still streaming
- **THEN** the header shows an active thinking indicator; after `reasoning_end` it shows a settled label and the body can be expanded to read the full reasoning

#### Scenario: User can collapse and expand

- **WHEN** the user clicks the reasoning header
- **THEN** the reasoning body toggles between expanded and collapsed

### Requirement: Auto-expand display preference

The renderer SHALL expose an `autoExpandReasoning` display preference, persisted
across sessions and surfaced in `SettingsModal`. When enabled, a reasoning part
SHALL auto-expand on start and auto-collapse on completion; when disabled, it
SHALL stay collapsed unless the user opens it. This preference SHALL only affect
display and SHALL NOT enable or disable thinking on the sidecar.

#### Scenario: Auto-expand on, follows the stream

- **WHEN** `autoExpandReasoning` is enabled and a reasoning part starts streaming
- **THEN** the section auto-expands while thinking, then auto-collapses when thinking completes

#### Scenario: Auto-expand off, stays collapsed

- **WHEN** `autoExpandReasoning` is disabled and a reasoning part streams
- **THEN** the section stays collapsed until the user opens it

#### Scenario: Preference does not toggle thinking

- **WHEN** the user changes `autoExpandReasoning`
- **THEN** no request is sent to the sidecar and whether thinking runs is unaffected

### Requirement: Redacted reasoning is distinguishable

The renderer SHALL still show a reasoning section indicating an encrypted/redacted
thought, rather than an empty or broken block, when a reasoning block is redacted
(a `reasoning_start` of type redacted with no deltas).

#### Scenario: Redacted block shows a marker

- **WHEN** a `reasoning_start` of type `redacted` is followed directly by `reasoning_end` with no deltas
- **THEN** the section renders a redacted-thought marker, not empty text
