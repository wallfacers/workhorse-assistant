## ADDED Requirements

### Requirement: Real filesystem data source

The Directory tab in the right panel SHALL display real filesystem data from the active session's working directory, replacing the current mock data. The file tree root SHALL be the session's `workdir`. The system SHALL use the existing `fsList()` IPC function to fetch directory listings.

#### Scenario: File tree loads real project files
- **WHEN** the right panel is opened and the Directory tab is active
- **THEN** the file tree shows the top-level files and folders from the active session's workdir
- **AND** folders display the appropriate folder icon, files display the file icon

#### Scenario: No active session
- **WHEN** there is no active session or no workdir set
- **THEN** the file tree shows an empty state with a message indicating no project is open

### Requirement: Lazy loading directory expansion

The file tree SHALL load directory contents on demand. Initially, only the root directory's immediate children are loaded. When a folder is expanded, the system SHALL call `fsList(folderPath)` to fetch that folder's children. Folders that have not been loaded yet SHALL show a loading indicator while fetching.

#### Scenario: Expand a folder for the first time
- **WHEN** the user clicks a folder node that has not been expanded before
- **THEN** a loading indicator appears briefly
- **AND** the folder's children are fetched via `fsList` and displayed

#### Scenario: Collapse and re-expand a folder
- **WHEN** the user collapses a previously expanded folder and expands it again
- **THEN** the previously loaded children are shown immediately without refetching

#### Scenario: Expand a folder that fails to load
- **WHEN** the `fsList` call for a folder fails (e.g., permission denied)
- **THEN** an error indicator is shown next to the folder
- **AND** the folder remains collapsed

### Requirement: Click file to open in editor

Clicking a file node in the file tree SHALL open that file as an editor tab in the TerminalWorkspace. If the file is already open in an existing editor tab, that tab SHALL be activated instead of creating a duplicate.

#### Scenario: Click a file to open
- **WHEN** the user clicks a file node in the file tree
- **THEN** the file is opened as a new editor tab in TerminalWorkspace
- **AND** the editor tab becomes the active tab

#### Scenario: Click an already-open file
- **WHEN** the user clicks a file that already has an open editor tab
- **THEN** the existing editor tab is activated
- **AND** no duplicate tab is created

### Requirement: Right-click context menu for rename

The file tree SHALL provide a context menu on right-click for both files and folders. The context menu SHALL include a "Rename" option. Selecting "Rename" SHALL inline an editable text field over the node's name, allowing the user to type a new name and confirm with Enter or cancel with Escape.

#### Scenario: Right-click shows context menu
- **WHEN** the user right-clicks a file or folder node
- **THEN** a context menu appears with a "Rename" option
- **AND** the menu is positioned at the cursor location

#### Scenario: Rename a file
- **WHEN** the user selects "Rename" from the context menu and types a new name and presses Enter
- **THEN** the system calls `fsRename(oldPath, newPath)` via the Tauri command
- **AND** the file tree refreshes to show the new name
- **AND** if the file was open in an editor tab, the tab label and internal path are updated

#### Scenario: Rename fails
- **WHEN** the rename operation fails (e.g., name already exists, permission denied)
- **THEN** an error message is displayed and the original name is restored

#### Scenario: Cancel rename
- **WHEN** the user presses Escape during inline rename
- **THEN** the rename is cancelled and the original name is restored

### Requirement: File tree refresh after file operations

The file tree SHALL refresh its content after file save and rename operations to reflect changes on disk.

#### Scenario: Refresh after rename
- **WHEN** a file or folder is renamed successfully
- **THEN** the file tree updates to show the new name in the correct location

#### Scenario: Refresh after save (if new file)
- **WHEN** a file is saved and it did not previously exist in the tree
- **THEN** the file tree refreshes the parent folder to show the new file

### Requirement: File tree styling alignment

All file tree components SHALL use DESIGN.md CSS variable tokens for colors, spacing, and typography. The context menu SHALL follow the existing design patterns for popovers (background: `--color-surface`, border: `--color-outline`, rounded: `--radius-lg`).

#### Scenario: Design lint passes
- **WHEN** the file tree is implemented
- **THEN** `npm run design:lint` reports no errors related to file tree components
- **AND** no hardcoded hex values appear in the file tree code
