## ADDED Requirements

### Requirement: App-level centralized shortcut provider

The app SHALL mount a `ShortcutProvider` at the root that owns a single `window.keydown` listener. Components SHALL register shortcut handlers imperatively via `useShortcut(action, handler)` rather than attaching their own window-level listeners. The provider SHALL maintain a handler registry keyed by `ShortcutAction`.

#### Scenario: Shortcut fires when no input is focused

- **WHEN** the user presses ⌘N (or Ctrl+N on Windows/Linux) and no text input is focused
- **THEN** the registered handler for `newTask` is invoked

#### Scenario: Shortcut is suppressed during IME composition

- **WHEN** the user is composing CJK text in the chat input and presses Enter
- **THEN** the `sendMessage` shortcut does NOT fire; the IME consumes the Enter

#### Scenario: Shortcut fires with platform-appropriate modifier

- **WHEN** the user presses ⌘, on macOS
- **THEN** the `openSettings` handler fires
- **WHEN** the user presses Ctrl+, on Windows/Linux
- **THEN** the `openSettings` handler fires

### Requirement: Platform-aware modifier key matching

The shortcut system SHALL detect the current platform via `navigator.platform` and treat `mod` as metaKey on macOS and ctrlKey on Windows/Linux. Keybinding display SHALL render `⌘` on macOS and `Ctrl+` on other platforms.

#### Scenario: macOS detection

- **WHEN** `navigator.platform` contains "Mac"
- **THEN** `isMac()` returns true; primary modifier is metaKey; display uses `⌘`

#### Scenario: Non-macOS detection

- **WHEN** `navigator.platform` does not contain "Mac"
- **THEN** `isMac()` returns false; primary modifier is ctrlKey; display uses `Ctrl`

### Requirement: Configurable keybindings persisted to localStorage

Shortcut bindings SHALL be stored as a JSON object in `localStorage` under the key `workhorse:shortcuts`. On load, user overrides SHALL be merged over `DEFAULT_SHORTCUTS`. On save, only diffs from defaults SHALL be written. Invalid or missing localStorage data SHALL fall back to defaults silently.

#### Scenario: First launch uses defaults

- **WHEN** `localStorage` contains no `workhorse:shortcuts` key
- **THEN** all 10 shortcuts use `DEFAULT_SHORTCUTS`

#### Scenario: User override survives reload

- **WHEN** the user changes `newTask` from ⌘N to ⌘T, then the app reloads
- **THEN** pressing ⌘T fires `newTask` and pressing ⌘N does nothing

#### Scenario: Corrupted data falls back to defaults

- **WHEN** `workhorse:shortcuts` contains unparseable JSON
- **THEN** all shortcuts use `DEFAULT_SHORTCUTS` for this session; the corrupted key is not overwritten until the user explicitly saves

### Requirement: Shortcut configuration takes effect immediately

When the user saves a modified keybinding in Settings, the change SHALL update the `ShortcutProvider`'s internal config state synchronously. The global `keydown` listener SHALL read the latest config via a ref so no re-render is required for the new binding to work.

#### Scenario: Change takes effect without page reload

- **WHEN** the user changes `splitTerminal` from ⌘D to ⌘\ and closes Settings
- **THEN** pressing ⌘\ immediately triggers split; pressing the old ⌘D no longer triggers split

### Requirement: xterm focus scoping

When xterm.js has focus (detected by `document.activeElement` carrying the class `xterm-helper-textarea`), terminal-scoped shortcuts (`newTerminal`, `splitTerminal`, `closePanel`) SHALL still fire. All other shortcuts SHALL also fire — ⌘ shortcuts are reserved for app navigation, not terminal input. xterm's own `attachCustomKeyEventHandler` handles Ctrl+C/V independently.

#### Scenario: ⌘D splits terminal while xterm is focused

- **WHEN** the user is typing in the terminal (xterm textarea focused) and presses ⌘D
- **THEN** the active terminal pane splits; the character 'd' is NOT typed

#### Scenario: ⌘, opens settings while xterm is focused

- **WHEN** the user is typing in the terminal and presses ⌘,
- **THEN** the settings modal opens

### Requirement: LIFO escape stack for overlays

The shortcut system SHALL maintain a LIFO stack of escape handlers. Each overlay (modal, confirm dialog) pushes its close handler on mount and pops it on unmount. Pressing Escape SHALL invoke only the topmost handler, matching OS-level dialog behavior.

#### Scenario: Nested overlay escape order

- **WHEN** Settings modal is open, then a confirm dialog opens inside it
- **THEN** pressing Escape closes the confirm dialog only; pressing Escape again closes Settings

#### Scenario: Empty escape stack is a no-op

- **WHEN** no overlays are open
- **THEN** pressing Escape does nothing

#### Scenario: Inline edit Escape does not bubble to stack

- **WHEN** the user is renaming a session in Settings (inline input focused) and presses Escape
- **THEN** the inline rename is cancelled; the Settings modal stays open

### Requirement: Recording mode for shortcut customization

The Settings → Shortcuts section SHALL support clicking a keybinding chip to enter recording mode. In recording mode, a one-shot capture-phase `keydown` listener SHALL record the next non-modifier keydown and construct a `KeyBinding` from the active modifiers and key code. Pressing Escape during recording SHALL cancel without saving.

#### Scenario: Record a new modifier+key combination

- **WHEN** the user clicks the `newTask` shortcut chip, then presses ⌘⇧N
- **THEN** the `newTask` binding is updated to `{ mod: true, shift: true, code: "KeyN" }`; display shows `⌘⇧N`; recording mode exits

#### Scenario: Cancel recording with Escape

- **WHEN** the user clicks a shortcut chip, then presses Escape
- **THEN** the binding is unchanged; recording mode exits

#### Scenario: Modifier-only keypress is rejected

- **WHEN** the user clicks a shortcut chip, then presses only ⌘ (no non-modifier key)
- **THEN** recording mode stays active; the modifier-only press is ignored

### Requirement: Shortcut conflict detection and warning

When two actions share the same keybinding, the Settings UI SHALL display a ⚠ conflict warning on both rows showing the conflicting action's name. At runtime, the first-registered handler wins. Conflicts SHALL NOT block saving.

#### Scenario: Conflict warning displayed

- **WHEN** the user sets `newTask` to ⌘D (which is already used by `splitTerminal`)
- **THEN** both `newTask` and `splitTerminal` rows show a ⚠ badge with the other action's name; both bindings are saved

#### Scenario: Reset to defaults clears conflicts

- **WHEN** the user clicks "Reset to defaults" after creating conflicting bindings
- **THEN** all bindings revert to `DEFAULT_SHORTCUTS`; all conflict warnings disappear

### Requirement: Default shortcut bindings

The system SHALL ship with these 10 default bindings:

| Action | macOS key | Windows/Linux key |
|--------|-----------|-------------------|
| `newTask` | ⌘N | Ctrl+N |
| `globalSearch` | ⌘K | Ctrl+K |
| `openSettings` | ⌘, | Ctrl+, |
| `closePanel` | ⌘W | Ctrl+W |
| `toggleSidebar` | ⌘\ | Ctrl+\ |
| `newTerminal` | ⌘T | Ctrl+T |
| `splitTerminal` | ⌘D | Ctrl+D |
| `sendMessage` | ⌘Enter | Ctrl+Enter |
| `showShortcuts` | ⌘/ | Ctrl+/ |
| `cancelClose` | Esc | Esc |

#### Scenario: Default shortcuts on first launch

- **WHEN** the app launches with no saved shortcuts
- **THEN** all 10 shortcuts use the bindings listed in the table above
