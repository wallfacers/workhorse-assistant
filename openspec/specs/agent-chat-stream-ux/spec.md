# agent-chat-stream-ux Specification

## Purpose
TBD - created by archiving change agent-chat-stream-polish. Update Purpose after archive.
## Requirements
### Requirement: Stable rendering during streaming

While the assistant streams output, already-rendered content SHALL NOT visibly
move or re-flow. A message bubble whose content has not changed SHALL NOT
re-parse its markdown when a different message streams, and a code block SHALL
keep a constant height when it transitions from the plain streaming view to the
syntax-highlighted view (same padding, font-size, and line-height), so the
streaming→highlighted swap does not trigger a scroll jump.

#### Scenario: Sibling messages stay still

- **WHEN** the assistant streams a new message while earlier messages are visible
- **THEN** the earlier message bubbles do not re-render their markdown and do not visibly shift

#### Scenario: Highlight swap does not jump

- **WHEN** a code block finishes streaming and is replaced by its syntax-highlighted version
- **THEN** the block height is unchanged and the message list does not jump

#### Scenario: Fenced code reveals whole, not per-character

- **WHEN** a fenced code block is streaming
- **THEN** the code content is shown in full (pacing bypassed) rather than growing one character at a time

### Requirement: Code block syntax colouring

Code blocks SHALL render with Shiki per-token syntax colours in both light and
dark themes. The renderer SHALL consume Shiki's `--shiki-light` / `--shiki-dark`
per-token CSS variables (emitted with `defaultColor: false`) by applying them as
the token text colour, so switching theme recolours without re-highlighting.

#### Scenario: Tokens are multi-coloured

- **WHEN** a highlighted code block is displayed in light theme
- **THEN** keywords, strings, and identifiers render in distinct Shiki `github-light` colours (not a single flat colour)

#### Scenario: Theme switch recolours instantly

- **WHEN** the user toggles dark mode while a highlighted code block is visible
- **THEN** the same block recolours via the `--shiki-dark` variables without being re-highlighted

### Requirement: Code block visual separation

A code block SHALL have a background distinct from the surrounding message
bubble in both themes, sourced from DESIGN.md design tokens (no hand-tuned hex
values in the component). The block's top bar (language label + copy) SHALL stay
visually separated from the code body.

#### Scenario: Block is distinguishable from the bubble

- **WHEN** a code block appears inside an assistant message bubble
- **THEN** the code block background is visibly different from the bubble background in both light and dark themes

### Requirement: Code block horizontal scroll

When a code line is wider than the block, the block SHALL scroll horizontally
rather than wrapping the line or widening the message bubble. The content flex
chain SHALL allow the block to shrink (`min-width: 0`) so overflow scrolls within
the block via a horizontal scrollbar.

#### Scenario: Long line scrolls, does not stretch

- **WHEN** a code block contains a line longer than the available width
- **THEN** the block shows a horizontal scrollbar and the message bubble width is unchanged

### Requirement: First-token placeholder

On sending a user message, the assistant row SHALL appear immediately with its
avatar and a blinking placeholder indicator (a star/sparkle icon that
colour-cycles and settles on the project theme colour) until the first token
arrives. When the first token arrives, the placeholder SHALL be replaced in place
(reusing the same message id, no row remount) by the streamed text.

#### Scenario: Placeholder shows before first token

- **WHEN** the user sends a message and no assistant token has arrived yet
- **THEN** the assistant row is shown with its avatar and a blinking colour-cycling star placeholder

#### Scenario: Placeholder replaced in place

- **WHEN** the first assistant token arrives
- **THEN** the placeholder is replaced by the streaming text within the same row, without a layout jump

#### Scenario: Placeholder cleared on early error

- **WHEN** the run errors or ends before any token arrives
- **THEN** the placeholder is cleared (replaced by the error block or removed), leaving no dangling blinking indicator

