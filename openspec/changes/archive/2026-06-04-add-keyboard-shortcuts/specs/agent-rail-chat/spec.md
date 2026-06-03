## MODIFIED Requirements

### Requirement: Chat input Enter-to-send uses shortcut system

The `Enter` (without Shift) to send behavior in `AgentRail.tsx`'s chat textarea SHALL remain as an element-level `onKeyDown` handler. Additionally, `⌘Enter` SHALL trigger send globally via `useShortcut('sendMessage')` — matching the behavior of Slack, Discord, and iMessage where ⌘Enter sends from anywhere in the app.

#### Scenario: ⌘Enter sends message while chat input is focused

- **WHEN** the chat textarea is focused, text is non-empty, and ⌘Enter is pressed
- **THEN** the message is sent; the input clears

#### Scenario: Plain Enter (no modifiers) sends via existing handler

- **WHEN** the chat textarea is focused and plain Enter is pressed (no Shift for newline)
- **THEN** the existing element-level handler fires; the shortcut system is NOT involved

#### Scenario: ⌘N opens task list modal

- **WHEN** the user presses ⌘N
- **THEN** the task list modal (`TaskListModal`) opens

#### Scenario: ⌘, opens settings modal

- **WHEN** the user presses ⌘,
- **THEN** the Settings modal opens (to the last-active tab)
