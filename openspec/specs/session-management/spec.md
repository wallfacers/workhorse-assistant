# session-management Specification

## Purpose
TBD - created by archiving change add-session-management. Update Purpose after archive.
## Requirements
### Requirement: Session management tab in settings

SettingsModal SHALL include a fourth navigation tab labeled「会话」(zh-CN) / "Sessions" (en-US)
that displays all non-deleted sessions for the currently active project in an
interactive table.

#### Scenario: Navigate to session management tab

- **WHEN** the user opens Settings and clicks the「会话」/ "Sessions" nav item
- **THEN** the content area displays a table of the current project's sessions
- **AND** the nav item highlights as active

#### Scenario: No sessions in current project

- **WHEN** the current project has no sessions
- **THEN** the table area displays an empty-state message with the translated
  text "暂无会话" / "No sessions"

### Requirement: Session table columns

The session table SHALL display the following columns for each session:

- **Checkbox**: a selectable checkbox for batch operations
- **Title**: the session's title, or a placeholder "未命名会话" / "Untitled" if empty
- **Status**: a colored dot indicating `idle` (gray) or `running` (green, animated pulse)
- **Message count**: the number of messages in the session transcript
- **Updated time**: the relative time since `updatedAt` (e.g., "2 小时前", "昨天", "3 天前")
- **Actions**: icon buttons for inline rename and delete

#### Scenario: Display session with all fields

- **WHEN** the session list loads successfully
- **THEN** each row shows the checkbox, title, status dot, message count, relative
  updated time, and action buttons
- **AND** the table header row has a surface-muted background with semibold text

#### Scenario: Session has an empty title

- **WHEN** a session's title is empty or null
- **THEN** the title column displays "未命名会话" / "Untitled" in muted text

#### Scenario: Session is currently running

- **WHEN** a session has status `running`
- **THEN** its status dot is green with a pulse animation
- **AND** idle sessions display a gray dot without animation

### Requirement: Inline session rename

The session table SHALL support inline renaming by clicking the edit button in a
session's actions column.

#### Scenario: Start inline rename

- **WHEN** the user clicks the edit (pencil) icon in a session row
- **THEN** the title cell transforms into a text input pre-filled with the current
  title
- **AND** the input is auto-focused

#### Scenario: Submit rename with Enter

- **WHEN** the user presses Enter in the rename input with a non-empty value
- **THEN** the session is renamed via `renameAgentSession` and the input reverts to
  display mode showing the new title

#### Scenario: Cancel rename with Escape

- **WHEN** the user presses Escape in the rename input
- **THEN** the rename is cancelled and the input reverts to display mode with the
  original title

#### Scenario: Submit rename on blur

- **WHEN** the rename input loses focus with a non-empty value
- **THEN** the rename is submitted (same as Enter)

### Requirement: Single session delete

Each session row SHALL provide a delete action with a confirmation step to prevent
accidental deletion.

#### Scenario: Request delete

- **WHEN** the user clicks the delete (trash) icon in a session row
- **THEN** the button changes to a "确认删除" / "Confirm" state styled in danger
  color (red)

#### Scenario: Confirm delete

- **WHEN** the user clicks the confirmed delete button
- **THEN** the session is deleted via `deleteAgentSession` and the row is removed
  from the table

#### Scenario: Cancel delete request

- **WHEN** the delete button is in confirmation state and the user clicks elsewhere
  or presses Escape
- **THEN** the button reverts to its normal state

### Requirement: Batch session selection and deletion

The table SHALL support selecting multiple sessions via checkboxes and deleting
them in one operation.

#### Scenario: Select individual sessions

- **WHEN** the user checks one or more row checkboxes
- **THEN** a toolbar appears above the table showing the count of selected sessions
  and a "删除选中 (N)" / "Delete selected (N)" button

#### Scenario: Select all sessions

- **WHEN** the user clicks the header row checkbox
- **THEN** all visible sessions are selected
- **AND** clicking it again deselects all

#### Scenario: Batch delete with confirmation

- **WHEN** the user clicks "删除选中 (N)" with N > 0 sessions selected
- **THEN** a confirmation banner appears: "确定要删除 N 个会话？此操作不可撤销。" /
  "Delete N sessions? This cannot be undone."
- **AND** the banner has "确认删除" / "Confirm" (danger) and "取消" / "Cancel" buttons

#### Scenario: Execute batch delete

- **WHEN** the user confirms the batch delete
- **THEN** each selected session is deleted sequentially via `deleteAgentSession`
- **AND** the table refreshes to show remaining sessions
- **AND** a brief success message is shown: "已删除 N 个会话" / "Deleted N sessions"

#### Scenario: No sessions selected

- **WHEN** no sessions are selected
- **THEN** the batch toolbar is hidden

### Requirement: Table styling follows DESIGN.md

The session table SHALL use design tokens from `docs/DESIGN.md` and match the
existing Markdown table visual conventions.

#### Scenario: Table visual tokens

- **WHEN** the table is rendered
- **THEN** the table container has `border-radius: 12px` and a 1px `outline` border
- **AND** header cells have `background: var(--color-surface-muted)` and
  `font-weight: 600`
- **AND** body cells use `font-size: 11.5px` with `padding: 0.375rem 0.625rem`
- **AND** row separators use `border-bottom: 1px solid var(--color-outline)`
- **AND** rows have a hover state using `surface-muted` at reduced opacity
- **AND** dark mode values are inherited through CSS variables without component-level
  branching

