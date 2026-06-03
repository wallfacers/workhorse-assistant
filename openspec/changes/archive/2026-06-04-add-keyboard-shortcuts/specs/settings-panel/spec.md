## MODIFIED Requirements

### Requirement: Interactive shortcut editing in ShortcutsSection

The `ShortcutsSection` component in `SettingsModal.tsx` SHALL be rewritten from a static shortcut reference table into an interactive editor. Each shortcut row SHALL display the action description (i18n) and a clickable keybinding chip showing the platform-aware key combination. Clicking the chip SHALL enter recording mode.

#### Scenario: Shortcut chip shows platform-aware label

- **WHEN** the user is on macOS
- **THEN** the `newTask` row shows `⌘ N`
- **WHEN** the user is on Windows
- **THEN** the `newTask` row shows `Ctrl+N`

#### Scenario: Click chip enters recording mode

- **WHEN** the user clicks the ⌘N chip
- **THEN** the chip text changes to a pulsing "按下按键..." placeholder; a capture-phase keydown listener is activated

#### Scenario: Recording mode captures next key combo

- **WHEN** recording mode is active and the user presses ⌘⇧E
- **THEN** the binding is saved as `{ mod: true, shift: true, code: "KeyE" }`; the chip displays `⌘⇧E`; recording mode exits

### Requirement: Reset to defaults

The ShortcutsSection SHALL include a "恢复默认" (Reset to defaults) button that, after a confirmation dialog, resets all bindings to `DEFAULT_SHORTCUTS` and clears any conflict warnings.

#### Scenario: Reset with confirmation

- **WHEN** the user clicks "恢复默认" and confirms the dialog
- **THEN** all 10 shortcuts revert to default bindings; localStorage `workhorse:shortcuts` is cleared

#### Scenario: Reset cancelled

- **WHEN** the user clicks "恢复默认" but cancels the confirmation dialog
- **THEN** all bindings remain unchanged

### Requirement: Conflict warning display

When two or more actions are bound to the same key combination, both rows SHALL show a ⚠ icon with a tooltip naming the conflicting action.

#### Scenario: Conflict shown on both rows

- **WHEN** `newTask` and `splitTerminal` are both bound to ⌘D
- **THEN** the `newTask` row shows "⚠ 与「分割终端」冲突"; the `splitTerminal` row shows "⚠ 与「新建任务」冲突"
