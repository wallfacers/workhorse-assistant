# three-pane-shell Specification

> Capability name note: this describes the **layout structure** of the shell.
> It is distinct from the `components.app-shell` *visual token* in
> `docs/DESIGN.md`, which styles the outer window frame.

## ADDED Requirements

### Requirement: Three-pane application shell

The application SHALL present a three-pane shell: a left **Agent rail**, a center
**terminal workspace**, and a right **work panel**. The center pane SHALL host the
existing terminal workspace unchanged. The right pane SHALL be collapsible to
reclaim horizontal space and re-openable afterward. All panes SHALL draw their
structural colors, radii, spacing, and typography from `docs/DESIGN.md` role
tokens, with no hardcoded hex/rem values.

#### Scenario: Shell renders three panes in order

- **WHEN** the application loads
- **THEN** the left Agent rail appears left of the center pane, the center pane
  appears between the left and right panes, and the right work panel appears right
  of center
- **AND** the left Agent rail is narrower than the center pane
- **AND** the center pane is the existing terminal workspace, unchanged

#### Scenario: Right panel collapses and re-opens

- **WHEN** the user activates the right panel's collapse control
- **THEN** the right panel hides and the center workspace expands to fill the space
- **AND** a control remains by which the user can re-open the right panel

### Requirement: Agent rail (left)

The left pane SHALL be an Agent rail containing a **task composer** (a new-task
input and a model/tools selector), a **search** field, and a **task list**. In
this change the rail's content SHALL be presentational placeholder data: it
performs no process spawning, no persistence, and no network access. The rail
SHALL also carry the application's dark-mode toggle.

#### Scenario: Rail shows its regions

- **WHEN** the application loads
- **THEN** the Agent rail shows a task composer, a search field, and a task list
  populated with placeholder content
- **AND** one task list entry may be shown as the active/selected entry

#### Scenario: Dark-mode toggle works from the rail

- **WHEN** the user activates the dark-mode toggle in the Agent rail
- **THEN** the application switches between light and dark themes
- **AND** the toggle is available both in the desktop app and in browser dev mode

#### Scenario: Composer and search are inert placeholders

- **WHEN** the user types into the new-task input or the search field
- **THEN** no process is spawned, no data is persisted, and no network request is
  made (the controls are presentational in this change)

### Requirement: Work panel with details, files, and preview (right)

The right pane SHALL present three regions: a **Task details** region (task
metadata), a **Files** region rendering a collapsible file tree, and a **Preview**
region. The Files region SHALL render real filesystem data from the active session's workdir, loaded lazily via the `fsList` IPC function. Clicking a file in the Files region SHALL open an editor tab in the TerminalWorkspace. The Preview region is retained for later artifact viewing.

#### Scenario: Work panel shows its three regions

- **WHEN** the right panel is open
- **THEN** it shows a Task details region, a Files region, and a Preview region

#### Scenario: File tree shows real project files

- **WHEN** the right panel is open and the Directory tab is active
- **THEN** the Files region displays files and folders from the active session's workdir
- **AND** folders can be expanded to lazily load their children
- **AND** clicking a file opens it in an editor tab in the TerminalWorkspace

#### Scenario: File tree nodes expand and collapse with real data

- **WHEN** the user toggles a folder node in the Files tree
- **THEN** that folder's children are fetched via `fsList` and displayed (if not previously loaded) or shown from cache (if previously loaded)

#### Scenario: Preview region is retained for later artifact viewing

- **WHEN** the right panel is open
- **THEN** the Preview region renders placeholder preview content
- **AND** it performs no file read or network fetch in this change
- **AND** any action controls in the region (e.g. open / locate) are shown as **disabled**

### Requirement: Layout copies the wireframe, styling stays Workhorse

The shell's **arrangement** SHALL follow the product wireframe, but its visual
style SHALL remain the existing Workhorse system. New components SHALL take their
structural colors, radii, spacing, and typography from `docs/DESIGN.md` role
tokens, and SHALL NOT hardcode hex/rem values (`npm run design:lint` SHALL pass).
Incidental greys for which `docs/DESIGN.md` defines no role token MAY follow the
same Tailwind-palette pattern as the neighbouring retained components (consistent
with tech-debt #5, which tracks the missing grey scale); this change SHALL NOT be
blocked on closing that debt.

#### Scenario: New components match the Workhorse style without hardcoded values

- **WHEN** the Agent rail and work panel are implemented
- **THEN** their structural styling references existing `docs/DESIGN.md` role
  tokens, and any greys without a role token match the adjacent retained components
- **AND** `npm run design:lint` reports no errors (no hardcoded hex/rem)

### Requirement: Editor group type in TerminalWorkspace

The TerminalWorkspace's Group concept SHALL be extended to support a `kind` field with values `'terminal'` (default, existing behavior) and `'editor'`. Editor groups SHALL render a `FileEditor` component instead of a `TerminalGroup`. Editor groups SHALL NOT support split-pane operations.

#### Scenario: TerminalWorkspace renders editor group

- **WHEN** a Group with `kind: 'editor'` is active
- **THEN** the TerminalWorkspace renders a FileEditor component showing the file's content
- **AND** no terminal PTY is spawned for this group

#### Scenario: TabBar displays editor tab with file icon

- **WHEN** an editor group exists in the workspace
- **THEN** the TabBar shows the file's basename as the tab label
- **AND** a file icon is displayed next to the label
- **AND** a dirty indicator (dot) appears when the file has unsaved modifications

#### Scenario: TabBar dirty indicator for unsaved editor

- **WHEN** the user modifies content in an editor tab
- **THEN** a dot indicator appears on the tab in the TabBar
- **AND** the dot disappears after the file is saved
