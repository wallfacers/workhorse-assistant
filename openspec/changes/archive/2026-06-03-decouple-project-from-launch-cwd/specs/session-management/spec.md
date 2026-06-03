## MODIFIED Requirements

### Requirement: Session table columns

The session table SHALL display the following columns for each session:

- **Checkbox**: a selectable checkbox for batch operations
- **Title**: the session's title, or a placeholder "未命名会话" / "Untitled" if empty
- **Project**: the session's project path (`workdir`), shown truncated (e.g. the
  trailing path segment) with the full path available on hover; lets the user tell
  apart same-titled sessions from different projects
- **Status**: a colored dot indicating `idle` (gray) or `running` (green, animated pulse)
- **Message count**: the number of messages in the session transcript
- **Updated time**: the relative time since `updatedAt` (e.g., "2 小时前", "昨天", "3 天前")
- **Actions**: icon buttons for inline rename and delete

#### Scenario: Display session with all fields

- **WHEN** the session list loads successfully
- **THEN** each row shows the checkbox, title, project path, status dot, message
  count, relative updated time, and action buttons
- **AND** the table header row has a surface-muted background with semibold text

#### Scenario: Session has an empty title

- **WHEN** a session's title is empty or null
- **THEN** the title column displays "未命名会话" / "Untitled" in muted text

#### Scenario: Session is currently running

- **WHEN** a session has status `running`
- **THEN** its status dot is green with a pulse animation
- **AND** idle sessions display a gray dot without animation

#### Scenario: Project path is shown verbatim and disambiguates rows

- **WHEN** two sessions share a title but belong to different projects `P` and `Q`
- **THEN** their Project columns show `P` and `Q` respectively (verbatim, no
  host-path normalization), so the rows are distinguishable

## ADDED Requirements

### Requirement: Cross-project session listing in management

The session-management table SHALL list sessions from **all** projects, not just
the active project — it MUST NOT apply the active-project filter the in-app
switcher uses. The assistant SHALL source this list from the sidecar's full
persisted session list (`GET /v1/sessions` with no `workdir` query), with live
`running`/`idle` status overlaid, so that idle sessions from non-active projects
still appear.

#### Scenario: Sessions from multiple projects are all listed

- **WHEN** the user has sessions under projects `P` and `Q` and opens
  Settings → session management while `P` is the active project
- **THEN** the table lists sessions from both `P` and `Q`
- **AND** rename, delete, and batch selection operate on any listed row regardless
  of which project is active

#### Scenario: Idle sessions in non-active projects appear

- **WHEN** a project `Q` (not currently active) has only idle persisted sessions
- **THEN** those sessions still appear in the management table, sourced from the
  full persisted list rather than the in-memory live set
