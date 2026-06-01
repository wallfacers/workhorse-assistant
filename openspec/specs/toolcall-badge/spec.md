## ADDED Requirements

### Requirement: Tool name is rendered as colored text with an icon

The system SHALL render the tool call name as colored monospace text styled with the `secondary` design token. The name SHALL NOT be wrapped in a pill/badge — it SHALL have no border, border-radius, padding, or background color.

The name SHALL be preceded by a tool icon (Lucide `Wrench`) to its left.

The tool name SHALL appear before the status dot and status label.

#### Scenario: Tool call with running status

- **WHEN** a tool call part with status `running` is rendered
- **THEN** the tool name appears as colored text with `text-secondary` (light mode) or `dark:text-[#5bb5cc]` (dark mode), with no border or background
- **AND** a `Wrench` icon is visible to the left of the name
- **AND** the status dot is amber with pulse animation

#### Scenario: Tool call with done status

- **WHEN** a tool call part with status `done` is rendered
- **THEN** the tool name styling remains identical
- **AND** the status dot is green without animation

#### Scenario: Tool call with error status

- **WHEN** a tool call part with status `error` is rendered
- **THEN** the tool name styling remains identical
- **AND** the status dot is red without animation

### Requirement: Summary row is lightweight without border or background

The summary row of the tool call block SHALL NOT have a border, border-radius, or background color. It SHALL render as a lightweight horizontal bar matching the visual style of `ReasoningPart`.

#### Scenario: Summary row appearance

- **WHEN** any tool call block is rendered
- **THEN** the outer details/summary container has no `border`, `rounded-md`, or `bg-surface-muted` classes
- **AND** the summary row has only `my-1.5` margin for spacing

### Requirement: Dark mode adapts all badge and row styles

All color properties of the badge and summary row SHALL adapt to dark mode using Tailwind `dark:` variants, without component-level dark mode logic.

#### Scenario: Dark mode rendering

- **WHEN** the app is in dark mode
- **THEN** the tool name text uses `dark:text-[#5bb5cc]`
- **AND** the summary hover uses `dark:hover:bg-neutral-800/60`

### Requirement: Expand/collapse preserves input and output display

When the summary row is clicked to expand the block, the system SHALL display the tool call's input and output in pre-formatted code blocks, with the same styling as the current implementation.

#### Scenario: Expanded tool call with input and output

- **WHEN** a tool call with both input and output is expanded
- **THEN** an "Input" label and pre block are displayed
- **AND** an "Output" label and pre block are displayed
- **AND** both pre blocks are styled with mono font, white/dark background, and border

#### Scenario: Expanded tool call with only input

- **WHEN** a tool call with only input (no output) is expanded
- **THEN** only the "Input" pre block is displayed
- **AND** the input pre block retains the independent card styling

### Requirement: Chevron icon indicates expand/collapse state

A chevron icon SHALL be rendered to the left of the badge. It SHALL point right (`ChevronRight`) when collapsed and down (`ChevronDown`) when expanded, with a 200ms rotation transition.

#### Scenario: Collapsed state chevron

- **WHEN** the tool call block is collapsed
- **THEN** the chevron icon is `ChevronRight`
- **AND** clicking the chevron expands the block

#### Scenario: Expanded state chevron

- **WHEN** the tool call block is expanded
- **THEN** the chevron icon is `ChevronDown`
- **AND** clicking the chevron collapses the block
