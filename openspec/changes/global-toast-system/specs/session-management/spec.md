## MODIFIED Requirements

### Requirement: Single session delete

Each session row SHALL provide a delete action that confirms through the global
confirmation dialog before deleting. The inline two-step ("click again to
confirm") affordance SHALL be removed. On successful deletion, a success toast
SHALL be shown. On failure, an error toast SHALL be shown.

#### Scenario: Request delete opens the dialog

- **WHEN** the user clicks the delete (trash) icon in a session row
- **THEN** the global confirmation dialog opens, describing the destructive
  single-session delete with a danger-styled confirm action

#### Scenario: Confirm delete with success toast

- **WHEN** the user confirms in the dialog and the deletion succeeds
- **THEN** the session is deleted via `deleteAgentSession` and the row is removed
  from the table
- **AND** a success toast is shown: "会话已删除"

#### Scenario: Confirm delete with error toast

- **WHEN** the user confirms in the dialog and the deletion fails (returns false or throws)
- **THEN** an error toast is shown: "删除失败：{reason}"

#### Scenario: Cancel delete request

- **WHEN** the dialog is open and the user cancels (cancel button, overlay, or
  Escape)
- **THEN** no deletion occurs and the table is unchanged
- **AND** no toast is shown

### Requirement: Batch session selection and deletion

The table SHALL support selecting multiple sessions via checkboxes and deleting
them in one operation. The batch deletion SHALL be confirmed through the global
confirmation dialog. On successful batch deletion, a success toast SHALL be shown.

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
- **THEN** the global confirmation dialog opens stating "确定要删除 N 个会话？此操作不可撤销。" /
  "Delete N sessions? This cannot be undone." with a danger-styled confirm action

#### Scenario: Execute batch delete with toast

- **WHEN** the user confirms the batch delete in the dialog
- **THEN** each selected session is deleted sequentially via `deleteAgentSession`
- **AND** the table refreshes to show remaining sessions
- **AND** a success toast is shown: "已删除 N 个会话" / "Deleted N sessions"

#### Scenario: Batch delete partial failure

- **WHEN** the user confirms the batch delete and some deletions fail
- **THEN** a warning toast is shown: "已删除 M/N 个会话" where M is the count that succeeded
  and N is the total requested

#### Scenario: Cancel batch delete

- **WHEN** the dialog is open and the user cancels
- **THEN** no sessions are deleted and the selection is preserved

#### Scenario: No sessions selected

- **WHEN** no sessions are selected
- **THEN** the batch toolbar is hidden

### Requirement: Inline session rename

The session table SHALL support inline renaming by clicking the edit button in a
session's actions column. On successful rename, a success toast SHALL be shown.

#### Scenario: Start inline rename

- **WHEN** the user clicks the edit (pencil) icon in a session row
- **THEN** the title cell transforms into a text input pre-filled with the current
  title
- **AND** the input is auto-focused

#### Scenario: Submit rename with Enter

- **WHEN** the user presses Enter in the rename input with a non-empty value
- **THEN** the session is renamed via `renameAgentSession` and the input reverts to
  display mode showing the new title
- **AND** a success toast is shown: "已重命名"

#### Scenario: Cancel rename with Escape

- **WHEN** the user presses Escape in the rename input
- **THEN** the rename is cancelled and the input reverts to display mode with the
  original title

#### Scenario: Submit rename on blur

- **WHEN** the rename input loses focus with a non-empty value
- **THEN** the rename is submitted (same as Enter)
