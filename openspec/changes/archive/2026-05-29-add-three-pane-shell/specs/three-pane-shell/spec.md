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
region. In this change all three regions SHALL render placeholder content with no
filesystem or network access; the file tree SHALL be mock data and selecting a
file need not open any real file.

#### Scenario: Work panel shows its three regions

- **WHEN** the right panel is open
- **THEN** it shows a Task details region (mock metadata such as access id, tags,
  created date, branch, and original prompt), a Files region, and a Preview region

#### Scenario: File tree nodes expand and collapse

- **WHEN** the user toggles a folder node in the Files tree
- **THEN** that folder's children show or hide
- **AND** the tree is populated from mock data, reading no real filesystem

#### Scenario: Preview region is retained for later artifact viewing

- **WHEN** the right panel is open
- **THEN** the Preview region renders placeholder preview content
- **AND** it performs no file read or network fetch in this change
- **AND** any action controls in the region (e.g. open / locate) are shown as
  **disabled**, so the mock does not imply working operations

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
