## MODIFIED Requirements

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

## ADDED Requirements

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

### Requirement: Layout copies the wireframe, styling stays Workhorse

The shell's **arrangement** SHALL follow the product wireframe, but its visual
style SHALL remain the existing Workhorse system. New components (FileEditor, updated FileTree, context menu) SHALL take their structural colors, radii, spacing, and typography from `docs/DESIGN.md` role tokens, and SHALL NOT hardcode hex/rem values (`npm run design:lint` SHALL pass).

#### Scenario: New components match the Workhorse style without hardcoded values
- **WHEN** the FileEditor and updated FileTree are implemented
- **THEN** their structural styling references existing `docs/DESIGN.md` role tokens
- **AND** `npm run design:lint` reports no errors (no hardcoded hex/rem)
