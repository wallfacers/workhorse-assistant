# agent-project-navigation Specification

## Purpose
TBD - created by archiving change add-open-project-tool. Update Purpose after archive.
## Requirements
### Requirement: Agent can read the current project

The renderer SHALL register a side-effect-free reader `get_current_project` in
the agent tool catalog that returns the current project workdir, its display
label, and the list of recently-opened project paths. The reader SHALL reflect
live session state (`useSession`) at call time and SHALL NOT mutate anything.

#### Scenario: Read before switching

- **WHEN** the agent calls `get_current_project`
- **THEN** it returns `{ path, label, recentPaths }` where `path` is the current workdir, `label` is its basename display label, and `recentPaths` is the known/recent project paths
- **AND** no project switch or session re-attach occurs

#### Scenario: No project open yet

- **WHEN** no project has been selected and the sidecar default applies
- **THEN** `path` reflects the effective default workdir (or empty when none) and `recentPaths` is possibly empty, never throwing

### Requirement: Agent can switch the project directly

The renderer SHALL register an action `open_project` that re-attaches the
session to a given project `path` by routing through the existing
`useSession().openProject` path. By default (no `confirm`) the action SHALL
switch directly without showing any picker. The action SHALL be advertised as
parallel-unsafe. On success it SHALL return a structured confirmation; on a path
that does not resolve it SHALL return a self-repairing error, never a bare null.

#### Scenario: Valid path opens directly

- **WHEN** the agent calls `open_project` with a path that resolves to a directory
- **THEN** the session re-attaches to that workdir via `openProject`
- **AND** the action returns `{ opened: true, path, label }` with the resolved path and its display label

#### Scenario: Unresolvable path returns a self-repairing error

- **WHEN** the agent calls `open_project` with a path that does not resolve (checked via `fsList`)
- **THEN** no switch occurs and the action returns an error envelope whose message includes a suggestion or the nearest valid parent listing
- **AND** the agent can correct the path in a single retry

#### Scenario: Switching is a mutating action

- **WHEN** `open_project` is dispatched
- **THEN** it is handled through the action registry (parallel-unsafe, serialized), not the read-only state registry

### Requirement: Agent can request user confirmation through the existing picker

When `open_project` is called with `confirm: true`, the renderer SHALL NOT switch
immediately. Instead it SHALL open the existing `TitleBar` project switcher
popover, pre-navigated to the candidate `path`, and resolve the action only after
the user picks a path or dismisses the picker. No second/parallel folder-picker
UI SHALL be introduced; the same `ProjectBrowser` / `ProjectSwitcher` surface used
for manual switching SHALL be reused. The action's promise SHALL always settle so
the agent never hangs.

#### Scenario: Confirm opens the existing popover pre-filled

- **WHEN** the agent calls `open_project` with `confirm: true` and a candidate path
- **THEN** the `ProjectSwitcher` popover opens in browsing mode starting at the candidate path
- **AND** an assistant-visible hint indicates the picker was opened for confirmation

#### Scenario: User confirms a (possibly edited) path

- **WHEN** the user picks a folder in the confirmation picker
- **THEN** the session re-attaches to the picked path via `openProject`
- **AND** the action returns `{ opened: true, path, label }` for the user's final path, which may differ from the agent's candidate

#### Scenario: User cancels the confirmation

- **WHEN** the user dismisses the picker without choosing
- **THEN** no switch occurs and the action returns `{ opened: false, cancelled: true }` (a user choice, not a tool failure)

#### Scenario: Pending request never leaks

- **WHEN** the confirmation picker unmounts, or a newer confirm request supersedes a pending one
- **THEN** the outstanding request is cancelled and its promise settles, so the agent's tool call never hangs

#### Scenario: Manual switching is unchanged

- **WHEN** the user opens the project switcher by hand (no agent request pending)
- **THEN** the popover behaves exactly as before, starting at the default workdir, with no pre-filled candidate path

