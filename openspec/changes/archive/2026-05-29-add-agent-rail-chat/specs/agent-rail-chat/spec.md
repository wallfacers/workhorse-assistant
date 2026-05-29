# agent-rail-chat Specification

## ADDED Requirements

### Requirement: Left pane is a conversation panel

The left pane SHALL present a **conversation panel** containing a scrollable chat
bubble flow, a bottom AI input box, and a toolbar strip that provides access to
secondary controls including a task-list modal. The pane SHALL also carry the
application's dark-mode toggle. In this change all content (bubbles, task list)
SHALL be mock/placeholder data; no process spawning, persistence, or network
access occurs from this pane.

#### Scenario: Chat bubble flow renders mock conversation

- **WHEN** the application loads
- **THEN** the left pane shows a scrollable area containing at least one user
  bubble (right-aligned, tinted background) and at least one assistant bubble
  (left-aligned, avatar, elevated card)
- **AND** each assistant bubble has copy, thumbs-up, and thumbs-down action icons

#### Scenario: Input box accepts text

- **WHEN** the user types into the input textarea
- **THEN** the text appears in the textarea
- **AND** no message is sent, no process is spawned, and no network request is
  made (the input is presentational in this change)

#### Scenario: Task-list modal opens and closes

- **WHEN** the user activates the task-list button in the toolbar
- **THEN** a modal overlay appears containing a search field and a list of
  placeholder tasks
- **AND** activating a task entry OR pressing Escape closes the modal

#### Scenario: Dark-mode toggle works from the left pane

- **WHEN** the user activates the dark-mode toggle in the left pane
- **THEN** the application switches between light and dark themes
- **AND** the toggle is available both in the desktop app and in browser dev mode

### Requirement: Layout and styling follow Workhorse conventions

All new components in this change SHALL draw structural colors, radii, spacing,
and typography from `docs/DESIGN.md` role tokens, with no hardcoded hex/rem
values. `npm run design:lint` SHALL pass.

#### Scenario: New components match adjacent components' visual style

- **WHEN** the rewritten Agent rail and TaskListModal are rendered
- **THEN** bubble colors, border radii, and spacing are consistent with the
  existing `MainChat.tsx` visual language
- **AND** `npm run design:lint` reports no errors
