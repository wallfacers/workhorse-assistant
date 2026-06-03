# project-sessions Specification

## Purpose
A Claude-Code-style working model: a **project** is the sidecar's `workdir`, a
project holds many **sessions** (persisted by the sidecar), and sessions run
all-live in the background (per-session SSE). The chat panel shows the active
session's title with a switcher and a `⋯` menu (rename / delete); the TitleBar
switches projects. The renderer addresses sessions by id through the bridge and
never touches the network/filesystem directly.
## Requirements
### Requirement: Project model scoped to a local path

The assistant SHALL represent a **project** as a single local path (the sidecar's
`workdir`), treated as an opaque string in the sidecar's filesystem namespace. The
assistant SHALL allow opening multiple projects and switching the active one from
a control in the TitleBar. The active project SHALL scope the session list and the
`workdir` used when creating new sessions. The renderer and Rust bridge SHALL NOT
parse, normalize, or join the project path with host-path logic, and SHALL NOT
default `workdir` to the host process cwd.

#### Scenario: Open a project and list its sessions

- **WHEN** the user opens a project path `P`
- **THEN** the assistant requests the sessions for `P` from the sidecar and shows
  them in the session switcher
- **AND** new sessions created while `P` is active are created with `workdir = P`

#### Scenario: Switch the active project

- **WHEN** the user picks a different project `Q` from the TitleBar switcher
- **THEN** the session switcher reflects `Q`'s sessions
- **AND** the previously active project's running sessions continue running in the
  background (their streams are not torn down)

#### Scenario: Path is preserved verbatim

- **WHEN** a project path is displayed or sent to the sidecar
- **THEN** it is shown and transmitted exactly as the sidecar reported it, with no
  host-path normalization

### Requirement: Multiple persisted sessions per project

Each project SHALL hold many sessions whose transcripts are persisted by the
sidecar. The assistant SHALL list sessions (with title and status), create new
sessions, rename a session, and delete a session, through the Rust bridge. The
sidecar is the source of truth; the assistant SHALL NOT read or write the
sidecar's data directory directly.

#### Scenario: Create a new session

- **WHEN** the user chooses "new session" in the active project
- **THEN** the assistant creates a session via the bridge (sidecar allocates the
  id) and makes it the active session with an empty transcript

#### Scenario: Rename a session

- **WHEN** the user picks "rename" in the session `⋯` menu and submits a title
- **THEN** the assistant issues a rename through the bridge and the new title is
  reflected in the header and switcher

#### Scenario: Delete a session

- **WHEN** the user picks "delete" in the session `⋯` menu and confirms
- **THEN** the assistant deletes the session through the bridge, removes it from
  the store, and selects an adjacent session as active (or the empty state if none
  remain)

#### Scenario: Rehydrate a session from history

- **WHEN** the user opens a session whose transcript is not in memory
- **THEN** the assistant loads its messages from the sidecar history endpoint and
  renders them

### Requirement: Multi-live session continuity

Sessions SHALL continue running in the background regardless of which session is
visible. Switching away from a streaming session SHALL NOT cancel it or lose its
output, and switching back SHALL show its still-live stream. The conversation
state and SSE subscriptions SHALL live in an app-level store (not in the visible
`AgentRail`), keeping listeners mounted for the set of `active ∪ running`
sessions.

#### Scenario: Background session keeps streaming

- **WHEN** session A is streaming and the user switches to session B
- **THEN** A's output continues to accumulate in the store while B is shown
- **AND** switching back to A shows the accumulated output and the live stream
  continues

#### Scenario: Two sessions running at once

- **WHEN** the user has sent a message in both A and B and both are streaming
- **THEN** both sessions' streams are subscribed concurrently
- **AND** switching between them never interrupts either turn

#### Scenario: Idle non-active session is evicted from memory

- **WHEN** a session is neither active nor running
- **THEN** its in-memory buffer MAY be dropped and its stream closed
- **AND** revisiting it reloads its transcript from history without data loss

### Requirement: Per-session bridge addressing

The renderer bridge SHALL address every operation by an explicit `sessionId`
rather than an implicit single active session. Subscribing to an existing session
SHALL NOT create a duplicate session upstream.

#### Scenario: Address a specific session

- **WHEN** a send, cancel, permission decision, tool-result forward, or catalog
  publish is issued
- **THEN** it targets the given `sessionId` and does not affect other sessions

#### Scenario: Open an existing session without creating one

- **WHEN** the user switches to an existing session id
- **THEN** the bridge subscribes to that session's stream without issuing a
  create, so no duplicate session is allocated by the sidecar

### Requirement: Session header with title and actions

The AgentRail SHALL show a header with the active session's title at the top-left,
opening a session switcher (session list + new session), and a `⋯` menu at the
top-right exposing rename and delete. The dropdown/menu interaction SHALL match
the terminal profile menu (click-outside-to-close, no modal).

#### Scenario: Switch session from the title dropdown

- **WHEN** the user clicks the header title
- **THEN** a dropdown lists the active project's sessions (the running ones marked)
  plus a "new session" entry, and selecting one makes it active

#### Scenario: Open the session action menu

- **WHEN** the user clicks the `⋯` menu
- **THEN** a popover offers "rename" and "delete", and clicking outside it closes
  the popover without taking an action

### Requirement: Empty project starts a fresh session, never a directory-switch nag

Any local directory the user opens SHALL be treated as a valid project. When the
active project has finished loading its session list and has zero sessions, the
assistant SHALL start a fresh session in that project, or — when there is no
active session to send into — present a neutral "new session" affordance. It
SHALL NOT prompt the user to switch to the sidecar's reported `default_workdir`;
project switching lives in the TitleBar switcher. The sidecar's `default_workdir`
SHALL be used only as a cold-start seed for the active project when there is no
remembered project.

#### Scenario: Remembered project with no sessions starts fresh, no nag

- **WHEN** a remembered project `P` finishes loading and has zero sessions, and
  the sidecar reports `default_workdir = H` with `H ≠ P`
- **THEN** the assistant starts a new session in `P` (or shows a neutral "new
  session" button when there is no active session)
- **AND** does NOT prompt "the agent is running in a different directory — switch
  over?"

#### Scenario: Cold start with no remembered project seeds from the sidecar default

- **WHEN** the app launches with no remembered project and `GET /health` reports
  `default_workdir = H`
- **THEN** the assistant opens `H` as the active project
- **AND** when `/health` reports no `default_workdir`, the assistant shows the
  project picker instead of opening any project

### Requirement: File listing is confined to the active project

The sidecar's file-listing endpoint (`GET /v1/fs`) SHALL confine the paths it
returns to the project `workdir` the request is scoped to (an explicit project
root or the requesting session's `workdir`), not to a single globally configured
directory. The assistant SHALL browse rooted at the active project's path. A path
that escapes the scoped `workdir` SHALL be rejected.

#### Scenario: Browse within the active project

- **WHEN** the active project is `P` and the assistant lists a path inside `P`
- **THEN** the sidecar returns the directory entries

#### Scenario: Browse a project opened outside any global default

- **WHEN** a global `default_workdir` `H` is configured and the user opens a
  different project `Q` that is not under `H`, and the assistant lists a path
  inside `Q`
- **THEN** the sidecar returns `Q`'s entries without a `403`, because confinement
  follows the request's scoped `workdir`, not the global default

#### Scenario: Path escaping the scoped workdir is rejected

- **WHEN** a `/v1/fs` request targets a path that escapes the scoped project
  `workdir`
- **THEN** the sidecar responds `403 forbidden`

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

