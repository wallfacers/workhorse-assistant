## ADDED Requirements

### Requirement: Delete a project record from the switcher

The TitleBar project switcher SHALL provide a delete affordance for a known
project record. Because a project is derived from the sessions that share a
`workdir`, deleting a project record SHALL hard-delete every session under that
`workdir` via the bridge (`deleteAgentProject(workdir)` → sidecar
`DELETE /v1/projects?workdir=<path>`). The deletion SHALL be confirmed through the
global confirmation dialog before it runs, and SHALL be presented as
irreversible. The on-disk directory SHALL NOT be modified or removed — only the
sidecar's session records are deleted. The "Open project" entry SHALL remain, so
the user can re-open the same directory later as a fresh project.

#### Scenario: Delete a project record after confirmation

- **WHEN** the user chooses delete on a project `P` in the switcher and confirms
  in the global dialog
- **THEN** the assistant calls `deleteAgentProject(P)`, the sidecar hard-deletes
  all sessions under `P`, and `P` disappears from the projects list once it has no
  remaining sessions

#### Scenario: Cancelling leaves the project intact

- **WHEN** the user opens the delete confirmation for `P` and cancels
- **THEN** no deletion is performed and `P` and its sessions are unchanged

#### Scenario: The on-disk directory is never touched

- **WHEN** a project record `P` is deleted
- **THEN** only the sidecar session records for `P` are removed; the filesystem
  directory at `P` still exists
- **AND** the user can re-open `P` through "Open project", which starts with no
  sessions

### Requirement: Local cleanup and re-bootstrap after project deletion

After a project record is deleted, the assistant SHALL remove that path from the
locally remembered recents (`recentProjects` / localStorage). If the deleted
project was the active (`currentProject`), the assistant SHALL clear the active
selection and re-bootstrap to the default project (the sidecar's `default_workdir`
when available, otherwise the project picker / neutral empty state).

#### Scenario: Deleted project is dropped from recents

- **WHEN** project `P` is deleted and `P` was present in `recentProjects`
- **THEN** `P` is removed from `recentProjects` and its localStorage entry is
  updated, so it no longer appears as a remembered recent

#### Scenario: Deleting the active project re-bootstraps

- **WHEN** the deleted project `P` is the current active project
- **THEN** the active selection is cleared and the assistant re-bootstraps to the
  sidecar `default_workdir` if reported, otherwise shows the project picker /
  neutral "new session" state

#### Scenario: Deleting a non-active project keeps focus

- **WHEN** the deleted project `P` is not the active project
- **THEN** the active project and its sessions are unaffected
