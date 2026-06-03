## ADDED Requirements

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
