## ADDED Requirements

### Requirement: Editor tab opens in TerminalWorkspace

The system SHALL allow opening a file as an editor tab inside the TerminalWorkspace's TabBar, coexisting with existing terminal tabs. When a file is opened, the system SHALL create a new Group with `kind: 'editor'` and `filePath` set to the file's absolute path. The TabBar SHALL display the file's basename as the tab label, prefixed with a file icon.

#### Scenario: Open file from file tree
- **WHEN** the user clicks a file node in the Directory tab of the right panel
- **THEN** a new editor tab appears in the TerminalWorkspace's TabBar
- **AND** the tab label shows the file's basename (e.g., `App.tsx`)
- **AND** the editor tab becomes the active tab

#### Scenario: File already open in existing tab
- **WHEN** the user clicks a file that already has an open editor tab
- **THEN** the existing tab is activated (focused) instead of creating a duplicate
- **AND** no new tab is created

#### Scenario: Multiple files open simultaneously
- **WHEN** the user opens files A, B, and C from the file tree
- **THEN** three editor tabs appear in the TabBar
- **AND** each tab shows its respective file content when active

### Requirement: File content display with syntax highlighting

The system SHALL display file content using CodeMirror 6 with syntax highlighting appropriate to the file's language. The editor SHALL show line numbers, a blinking cursor, and support basic text editing (typing, selection, copy/paste).

#### Scenario: Open a TypeScript file
- **WHEN** the user opens a `.ts` or `.tsx` file
- **THEN** the editor displays the file content with TypeScript syntax highlighting
- **AND** keywords, strings, types, and comments are distinctly colored

#### Scenario: Open an unsupported file type
- **WHEN** the user opens a file with an unrecognized extension (e.g., `.log`, `.dat`)
- **THEN** the editor displays the file content as plain text without syntax highlighting
- **AND** the editor remains fully functional for editing

#### Scenario: Open a large file
- **WHEN** the user opens a file larger than 2 MB
- **THEN** the system SHALL display a warning that the file is large
- **AND** the editor SHALL open in read-only mode to prevent performance degradation

### Requirement: Editor theme alignment with DESIGN.md

The editor's visual theme SHALL align with `docs/DESIGN.md` token system. All colors (background, text, line numbers, selection, syntax tokens) SHALL reference CSS variables defined in DESIGN.md. The editor SHALL support both light and dark mode, switching dynamically when the application's dark mode toggle is activated.

#### Scenario: Light mode rendering
- **WHEN** the application is in light mode
- **THEN** the editor background uses `--color-surface`
- **AND** text uses `--color-on-surface`
- **AND** line numbers use `--color-on-surface-muted`

#### Scenario: Dark mode rendering
- **WHEN** the application is in dark mode
- **THEN** the editor background uses `--color-surface-dark-elevated`
- **AND** text uses `--color-on-surface-dark`
- **AND** line numbers use `--color-on-surface-dark-muted`

#### Scenario: Theme switching
- **WHEN** the user toggles dark mode while an editor tab is open
- **THEN** the editor re-renders with the appropriate theme without reloading file content
- **AND** unsaved edits are preserved during the theme switch

### Requirement: File save via keyboard shortcut

The system SHALL support saving file content via Ctrl+S (or Cmd+S on macOS). When saved, the system SHALL write the editor's content back to the original file path using the Tauri `fs_write` command. After successful save, the dirty indicator SHALL be cleared.

#### Scenario: Save modified file
- **WHEN** the user edits a file and presses Ctrl+S
- **THEN** the file content is written to disk via `agent_fs_write`
- **AND** the tab's dirty indicator (dot) is removed
- **AND** a brief success feedback is shown (e.g., status text clears)

#### Scenario: Save unmodified file
- **WHEN** the user presses Ctrl+S on an unmodified file
- **THEN** no write operation is performed (no-op)

#### Scenario: Save fails due to permissions
- **WHEN** the file cannot be written (e.g., permission denied)
- **THEN** the system SHALL display an error message explaining the failure
- **AND** the dirty indicator remains visible
- **AND** the editor content is preserved for retry

### Requirement: Dirty indicator on unsaved changes

The editor tab SHALL display a visual dirty indicator (a dot or asterisk) when the file has unsaved modifications. The indicator SHALL appear in the TabBar next to the file name.

#### Scenario: Indicator appears on edit
- **WHEN** the user modifies file content in the editor
- **THEN** a dirty indicator (dot) appears on the editor tab in the TabBar

#### Scenario: Indicator clears on save
- **WHEN** the user saves the file (Ctrl+S)
- **THEN** the dirty indicator is removed from the tab

#### Scenario: Close tab with unsaved changes
- **WHEN** the user attempts to close an editor tab that has unsaved changes
- **THEN** a confirmation dialog appears asking whether to save, discard, or cancel
- **AND** if the user cancels, the tab remains open
- **AND** if the user discards, the tab closes without saving
- **AND** if the user saves, the file is written to disk and the tab closes

### Requirement: Editor tab closes and cleanup

The system SHALL allow closing an editor tab. When closed, the tab is removed from the TabBar and the editor state is discarded. If the tab was the last tab, the TerminalWorkspace shows the empty state.

#### Scenario: Close editor tab
- **WHEN** the user clicks the close button on an editor tab
- **THEN** the tab is removed from the TabBar
- **AND** if there are other tabs, the nearest tab becomes active
- **AND** if it was the last tab, the empty state is shown

### Requirement: Language support coverage

The system SHALL support syntax highlighting for the following languages via CodeMirror 6 language packages: JavaScript, TypeScript, JSX, TSX, Python, Rust, HTML, CSS, JSON, Markdown, Java, C++, SQL, XML. The system SHALL use file extension mapping to select the appropriate language support.

#### Scenario: Recognize file extensions
- **WHEN** a file with extension `.py` is opened
- **THEN** Python syntax highlighting is applied
- **WHEN** a file with extension `.rs` is opened
- **THEN** Rust syntax highlighting is applied
- **WHEN** a file with extension `.tsx` is opened
- **THEN** TypeScript + JSX syntax highlighting is applied
