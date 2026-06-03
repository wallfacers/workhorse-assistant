## ADDED Requirements

### Requirement: Toast component uses existing design tokens

The toast component SHALL exclusively use design tokens from `docs/DESIGN.md` for
all visual properties: `surface` for card background, semantic color tokens for
the left-border accent, `outline` for the card border, and `body-sm` typography
for message text. No ad-hoc color values or hand-tuned numeric styles SHALL be
used.

#### Scenario: Toast card background uses surface token

- **WHEN** any toast card is rendered
- **THEN** its background color is `var(--color-surface)` (light) or the dark-mode
  equivalent, with no hardcoded hex values

#### Scenario: Toast border uses outline token

- **WHEN** any toast card is rendered
- **THEN** its outline border color is `var(--color-outline)`, consistent with the
  rest of the app's 1px outline convention

#### Scenario: Toast border-radius matches container convention

- **WHEN** any toast card is rendered
- **THEN** its `border-radius` is `var(--radius-md)` (12px), matching the container
  convention in DESIGN.md
