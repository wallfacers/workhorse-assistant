## MODIFIED Requirements

### Requirement: Single session delete

Each session row SHALL provide a delete action that confirms through the global
confirmation dialog before deleting. The inline two-step ("click again to
confirm") affordance SHALL be removed.

#### Scenario: Request delete opens the dialog

- **WHEN** the user clicks the delete (trash) icon in a session row
- **THEN** the global confirmation dialog opens, describing the destructive
  single-session delete with a danger-styled confirm action

#### Scenario: Confirm delete

- **WHEN** the user confirms in the dialog
- **THEN** the session is deleted via `deleteAgentSession` and the row is removed
  from the table

#### Scenario: Cancel delete request

- **WHEN** the dialog is open and the user cancels (cancel button, overlay, or
  Escape)
- **THEN** no deletion occurs and the table is unchanged

### Requirement: Batch session selection and deletion

The table SHALL support selecting multiple sessions via checkboxes and deleting
them in one operation. The batch deletion SHALL be confirmed through the global
confirmation dialog; the previous inline confirmation banner SHALL be removed.

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

#### Scenario: Execute batch delete

- **WHEN** the user confirms the batch delete in the dialog
- **THEN** each selected session is deleted sequentially via `deleteAgentSession`
- **AND** the table refreshes to show remaining sessions
- **AND** a brief success message is shown: "已删除 N 个会话" / "Deleted N sessions"

#### Scenario: Cancel batch delete

- **WHEN** the dialog is open and the user cancels
- **THEN** no sessions are deleted and the selection is preserved

#### Scenario: No sessions selected

- **WHEN** no sessions are selected
- **THEN** the batch toolbar is hidden
