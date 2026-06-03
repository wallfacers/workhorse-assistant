## MODIFIED Requirements

### Requirement: Modals use centralized escape stack

`Modal.tsx`, `TaskListModal.tsx`, and `ConfirmProvider.tsx` SHALL replace their ad-hoc `window.addEventListener('keydown', ...)` Escape listeners with `useEscape(handler, enabled)` from the centralized shortcut system. The escape handlers SHALL push onto the shared LIFO stack provided by `ShortcutProvider`.

#### Scenario: Settings modal Escape uses centralized stack

- **WHEN** the Settings modal is open and Escape is pressed
- **THEN** the centralized escape stack invokes the Settings close handler; the modal closes; the handler is popped from the stack

#### Scenario: Confirm dialog over Settings modal

- **WHEN** a confirm dialog is shown over the Settings modal and Escape is pressed
- **THEN** only the confirm dialog closes; the Settings modal stays open

#### Scenario: closeOnEsc=false disables escape

- **WHEN** a Modal is opened with `closeOnEsc={false}`
- **THEN** pressing Escape does NOT close it; other escape handlers in the stack are also not invoked (the disabled handler does not push onto the stack)
