# terminal-workspace Specification

## MODIFIED Requirements

### Requirement: In-group grid split

A group SHALL arrange its terminal **panes** as a **binary split tree**: each
pane occupies a leaf, and every internal node splits its area into two children
either **side by side** (row) or **stacked** (column). The user SHALL be able to
split a specific pane **right** or **down**, **resize** any split by dragging the
divider between its two children, **close** a pane, and **focus** a pane. A newly
split pane SHALL inherit the source pane's launch profile. Closing a pane SHALL
collapse its parent split and promote the surviving sibling into the parent's
place. Each `Terminal` leaf SHALL remain keyed by its stable pane id so that
splitting, closing, or resizing never restarts an unrelated pane's PTY session.

#### Scenario: Split a pane to the right

- **WHEN** the user splits the active pane to the right
- **THEN** the pane's area is divided into two side-by-side panes (row), the
  original on the left and a new pane on the right
- **AND** the new pane runs its own PTY session using the source pane's profile
- **AND** every other pane in the group keeps its existing PTY session running

#### Scenario: Split a pane downward

- **WHEN** the user splits the active pane downward
- **THEN** the pane's area is divided into two stacked panes (column), the
  original on top and a new pane below

#### Scenario: Splitting a resized pane preserves the surrounding layout

- **WHEN** the user splits a pane whose size was previously changed by dragging
- **THEN** the pane's outer size (its share of the surrounding layout) is
  unchanged
- **AND** only that pane's own area is divided between the two resulting panes

#### Scenario: Resize a split by dragging its divider

- **WHEN** the user drags the divider between two panes
- **THEN** the two panes' sizes change continuously to follow the divider
- **AND** each affected terminal refits to its new size without restarting its
  PTY session

#### Scenario: Close a pane collapses its split

- **WHEN** the user closes a pane that shares a split with a sibling subtree
- **THEN** that pane's terminal unmounts and its PTY child is terminated, leaving
  no orphan
- **AND** the surviving sibling expands to occupy the closed pane's area (its
  parent split is removed)
- **AND** if the closed pane was the focused pane, focus moves to the surviving
  subtree's first in-order leaf (no dangling active-pane reference)

#### Scenario: Closing the last pane closes the group

- **WHEN** the user closes the only remaining pane in a group
- **THEN** the group is closed as well, following the active-group reassignment
  rule (right neighbour, else left)

### Requirement: Profile selection on creation

The system SHALL let the user choose which launch profile a **new group** runs,
from the profiles the core exposes (`shell`, `claude-opus`, `claude-glm`,
`codex`). Splitting an existing pane SHALL NOT prompt for a profile; the new pane
SHALL inherit the source pane's profile. The renderer SHALL pass only the chosen
`profile_id` to the core, never a command line.

#### Scenario: Pick a profile for a new group

- **WHEN** the user opens the tab-bar profile menu and selects the entry labelled
  "claude+GLM"
- **THEN** the menu yields the canonical `profile_id` `claude-glm` (the
  hyphenated id, not the `+` display label)
- **AND** a new group is created whose first pane spawns via `pty_spawn` with
  `profile_id` `claude-glm`

#### Scenario: Split inherits the source profile

- **WHEN** the user splits a pane that is running the `codex` profile
- **THEN** the new pane spawns with `profile_id` `codex` without showing a picker

## ADDED Requirements

### Requirement: Keyboard split shortcuts

The system SHALL provide hard-coded keyboard shortcuts that operate on the
**active pane** of the **active group**: a split shortcut and a close shortcut.
The split shortcut SHALL choose the split direction automatically along the
active pane's longer edge (wider → right/row, taller → down/column) so panes
trend toward square. The shortcuts SHALL be matched by physical key code so they
work regardless of keyboard layout, and SHALL prevent the default action when
matched.

#### Scenario: Split the active pane via keyboard

- **WHEN** the user presses `Alt+Shift++` (the `+`/`=` physical key) while a pane
  is active
- **THEN** the active pane splits in two, along its longer edge, with the new pane
  inheriting the active pane's profile

#### Scenario: Close the active pane via keyboard

- **WHEN** the user presses `Alt+Shift+-` (the `-` physical key) while a pane is
  active
- **THEN** the active pane closes, following the same collapse/sibling-promotion
  rule as the close control

### Requirement: Clean pane card with hover controls

Each pane SHALL render as a clean card — a rounded container with a single 1px
outline and the terminal filling it — with **no always-visible header, label, or
badge**. Split and close controls SHALL be hidden at rest and revealed only when
the pointer hovers the pane, presented as icon buttons in the card's top-right
corner (split right, split down, close). The active pane SHALL be indicated by a
single accent-colored border using the existing `primary-container` token; all
styling SHALL use existing design tokens with no hand-tuned hex values.

#### Scenario: Resting pane shows only its content

- **WHEN** a pane is not hovered
- **THEN** the pane shows only its rounded card outline and terminal content — no
  header bar, profile label, count badge, or visible buttons

#### Scenario: Hover reveals split and close controls

- **WHEN** the pointer hovers over a pane
- **THEN** split-right, split-down, and close icon buttons appear in the pane's
  top-right corner
- **AND** activating split-right or split-down splits the pane in that direction,
  and activating close closes the pane

#### Scenario: Active pane is distinguished by an accent border

- **WHEN** a group holds more than one pane and the user focuses one of them
- **THEN** that pane's card border uses the `primary-container` accent while the
  others use the neutral outline token
