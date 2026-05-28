# terminal-workspace Specification

## ADDED Requirements

### Requirement: Tabbed terminal groups

The system SHALL present the center pane as a workspace of terminal **groups**
shown as tabs. The user SHALL be able to create a group, activate a group, and
close a group. Exactly one group is active (visible) at a time; the rest remain
mounted but hidden.

#### Scenario: Create a new group

- **WHEN** the user picks a profile from the `+` profile menu
- **THEN** a new group is created containing one terminal pane running that
  profile
- **AND** the new group becomes the active (visible) group

#### Scenario: Activate a group

- **WHEN** the user clicks a group's tab
- **THEN** that group becomes visible and the previously active group is hidden
- **AND** no terminal session is started or stopped by the switch

#### Scenario: Close a group

- **WHEN** the user closes a group's tab
- **THEN** every pane in that group is removed and each pane's PTY child is
  terminated
- **AND** if it was the active group, the **right-neighbour** group becomes
  active, or the **left-neighbour** if there is no right neighbour

### Requirement: Profile selection on creation

The system SHALL let the user choose which launch profile a new group or pane
runs, from the profiles the core exposes (`shell`, `claude-opus`, `claude-glm`,
`codex`). The renderer SHALL pass only the chosen `profile_id` to the core, never
a command line.

#### Scenario: Pick a profile for a new terminal

- **WHEN** the user opens the profile menu and selects the entry labelled
  "claude+GLM"
- **THEN** the menu yields the canonical `profile_id` `claude-glm` (the
  hyphenated id, not the `+` display label)
- **AND** the created pane spawns via `pty_spawn` with `profile_id` `claude-glm`
- **AND** the command and arguments are resolved solely by the core

### Requirement: In-group grid split

A group SHALL hold one or more terminal **panes** tiled in an equal-cell grid.
The user SHALL be able to split (add a pane), close a pane, and focus a pane.
S1 does not provide drag-to-resize or nested splits.

#### Scenario: Split a group into two panes

- **WHEN** the user splits the active group and picks a profile
- **THEN** a second pane appears beside the first in an equal-cell grid
- **AND** both panes run their own independent PTY session simultaneously

#### Scenario: Close a pane

- **WHEN** the user closes a pane
- **THEN** that pane's terminal unmounts and its PTY child is terminated, leaving
  no orphan
- **AND** the remaining panes reflow to fill the group
- **AND** if the closed pane was the focused pane, focus moves to a remaining
  pane (no dangling active-pane reference)

#### Scenario: Closing the last pane closes the group

- **WHEN** the user closes the only remaining pane in a group
- **THEN** the group is closed as well

### Requirement: Background sessions keep running

The system SHALL keep the sessions of non-active (hidden) groups running. Hiding
a group SHALL NOT terminate its panes' processes, so an agent continues working
while the user views another group.

#### Scenario: A backgrounded agent keeps working

- **WHEN** a group with a running agent is hidden by switching to another tab
- **THEN** that group's PTY child continues to run and its output is retained
- **AND** returning to the group shows the accumulated output, correctly sized
  to the viewport

### Requirement: Hidden-pane sizing safety

The system SHALL NOT resize a terminal whose container has zero size. When a
hidden group becomes visible again, the system SHALL refit its panes to the
current viewport.

#### Scenario: Hidden pane is not resized to zero

- **WHEN** a group is hidden (its container collapses to zero size)
- **THEN** no `pty_resize` with a zero dimension is issued for its panes

#### Scenario: Shown pane refits

- **WHEN** a hidden group becomes visible again
- **THEN** its panes refit to the current container size and the child
  application redraws at the correct geometry

### Requirement: Default and empty states

The system SHALL start with one group containing one `shell` pane. When no groups
remain, the system SHALL show an empty state offering to create a new terminal,
never a blank pane.

#### Scenario: Default startup

- **WHEN** the app launches
- **THEN** the workspace shows a single group with one `shell` terminal

#### Scenario: Empty workspace prompts creation

- **WHEN** the user closes the last remaining group
- **THEN** the workspace shows a "新建终端" prompt instead of an empty void
