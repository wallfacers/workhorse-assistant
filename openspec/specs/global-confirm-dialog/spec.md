# global-confirm-dialog Specification

## Purpose
TBD - created by archiving change add-global-confirm-and-project-delete. Update Purpose after archive.
## Requirements
### Requirement: App-level imperative confirmation service

The assistant SHALL provide a single confirmation service mounted once at the app
root (a `ConfirmProvider`) exposing an imperative hook `useConfirm()` that returns
a function `confirm(options) → Promise<boolean>`. The options SHALL include at
least `title`, `body`, an optional `danger` flag, and optional `confirmText` /
`cancelText` labels. The Promise SHALL resolve `true` when the user confirms and
`false` when the user cancels (via the cancel button, the overlay, or Escape).
There SHALL be exactly one dialog instance for the whole app; concurrent
`confirm()` calls are not required to stack.

#### Scenario: Resolve true on confirm

- **WHEN** a caller awaits `confirm({ title, body, danger: true })` and the user
  clicks the confirm button
- **THEN** the Promise resolves `true` and the dialog closes

#### Scenario: Resolve false on cancel

- **WHEN** the dialog is open and the user clicks cancel, clicks the overlay, or
  presses Escape
- **THEN** the Promise resolves `false` and the dialog closes without performing
  the action

#### Scenario: Danger styling for destructive actions

- **WHEN** `confirm()` is called with `danger: true`
- **THEN** the confirm button is rendered in the danger (red) tone

### Requirement: Confirmation dialog renders above all modals

The confirmation dialog SHALL render with its own overlay above every other
surface, including the Settings modal. Layering SHALL be governed by a documented
stacking scale in `docs/DESIGN.md`, exported as Tailwind tokens; raw `z-50`-style
hand-tuned values SHALL NOT be used for the confirm layer. The scale SHALL define
at least the relative order modal < confirm (with room for a higher toast/tooltip
tier).

#### Scenario: Confirm appears over the Settings modal

- **WHEN** a delete action is triggered from inside the Settings modal and the
  confirmation dialog opens
- **THEN** the dialog and its overlay render above the Settings modal, capturing
  interaction until resolved

#### Scenario: Layering comes from tokens

- **WHEN** the confirm layer's z-index is set
- **THEN** it references a token from the `docs/DESIGN.md` stacking scale rather
  than an ad-hoc numeric class

### Requirement: All human-initiated deletes route through the dialog

Every human-initiated delete in the renderer SHALL obtain confirmation through the
global confirmation service before performing the deletion. This includes session
delete (header `⋯` menu), batch session delete and single-row delete in the
session-management table, and project-record delete in the switcher. Inline
two-step ("click again to confirm") delete patterns SHALL be removed in favor of
the dialog.

#### Scenario: Session delete asks via the dialog

- **WHEN** the user triggers a session delete from any UI surface
- **THEN** the global confirmation dialog is shown and the session is deleted only
  if the user confirms

#### Scenario: Inline two-step confirms are removed

- **WHEN** the codebase performs a human-initiated delete that previously used an
  inline two-step confirm
- **THEN** that flow now calls `useConfirm()` instead of toggling a local
  "confirming" state

### Requirement: Exempt paths bypass the confirmation dialog

The confirmation dialog SHALL be invoked only at UI interaction handlers, never
inside shared mutation helpers (e.g. `deleteAgentSession`, `openProject`,
`deleteAgentProject`). As a consequence, the following SHALL NOT trigger the
dialog: PTY/terminal close (`ptyKill` / `closePane`), and any action invoked by
the AI agent through MCP/frontend tools (e.g. `open_project`,
`get_current_project`).

#### Scenario: PTY close is instant

- **WHEN** the user closes a terminal pane
- **THEN** the PTY is killed immediately with no confirmation dialog

#### Scenario: Agent tool calls are not gated by the dialog

- **WHEN** the AI agent invokes a frontend/MCP tool that mutates state (e.g.
  `open_project`)
- **THEN** the action proceeds through the shared helper without showing the human
  confirmation dialog

