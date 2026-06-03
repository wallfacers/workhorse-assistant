## MODIFIED Requirements

### Requirement: PTY sessions survive tab switches without layout thrashing

`TerminalGroup.tsx` SHALL guard its no-deps `useLayoutEffect` and `ResizeObserver` callbacks with an `offsetParent` check. When a group container is hidden via `display:none` (ancestor has no layout box), `measure()` SHALL be skipped, preventing zero-rect measurements that destabilize the terminal positioning layer.

#### Scenario: Tab switch does not zero out pane rects

- **WHEN** the user switches from Terminal Tab A to Terminal Tab B
- **THEN** Tab A's TerminalGroup `measure()` is skipped because its container's `offsetParent` is null; Tab A's pane rects retain their last non-zero values

#### Scenario: Tab switch back restores layout correctly

- **WHEN** the user switches back to Tab A (now visible again)
- **THEN** the ResizeObserver fires with correct dimensions; `measure()` updates rects; terminals are positioned correctly; PTY sessions remain connected

### Requirement: Terminal shortcuts use centralized shortcut system

`TerminalWorkspace.tsx` SHALL use `useShortcut()` from the centralized system for `newTerminal`, `splitTerminal`, and `closePanel` (⌘W). The ad-hoc `Alt+Shift+=` / `Alt+Shift+-` window keydown listener SHALL be removed.

#### Scenario: ⌘D splits the active terminal pane

- **WHEN** the user presses ⌘D
- **THEN** the active pane splits in the direction of its longer edge (horizontal split for wide panes, vertical split for tall panes); the new pane opens with the same profile

#### Scenario: ⌘W closes the active terminal pane

- **WHEN** the user presses ⌘W
- **THEN** the active pane closes; if it was the last pane, the group closes; PTY sessions in surviving panes are unaffected

#### Scenario: ⌘T opens a new terminal tab

- **WHEN** the user presses ⌘T
- **THEN** a new terminal group is created with the default `terminal` profile and activated

### Requirement: Terminal split direction auto-detection preserved

The split direction auto-detection logic (comparing pane width vs height to pick row or column) SHALL be preserved inside the `useShortcut('splitTerminal')` handler.

#### Scenario: Wide pane splits horizontally

- **WHEN** the active pane is wider than it is tall and ⌘D is pressed
- **THEN** the pane splits into a `row` layout (left | right)
