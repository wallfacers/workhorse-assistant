## 1. Fix PTY display:none race

- [x] 1.1 Guard `useLayoutEffect` in `TerminalGroup.tsx:108-110` with `offsetParent` check
- [x] 1.2 Guard `ResizeObserver` callback in `TerminalGroup.tsx:119` with `offsetParent` check
- [ ] 1.3 Verify: open 3 terminal tabs, switch between them, confirm PTY sessions survive

## 2. Create shortcut infrastructure

- [x] 2.1 Create `src/shortcuts/platform.ts` — `isMac()`, `modLabel()`, `modDisplay()`
- [x] 2.2 Create `src/shortcuts/types.ts` — `ShortcutAction` union, `KeyBinding` interface, `DEFAULT_SHORTCUTS` constant (10 bindings), `STORAGE_KEY`, `keyDisplay()`, `matchBinding()` helpers
- [x] 2.3 Create `src/shortcuts/ShortcutProvider.tsx` — Context, provider component, global `keydown` listener, handler registry, escape stack (LIFO), localStorage load/save (diffs-only persistence), xterm focus detection
- [x] 2.4 Create `src/hooks/useShortcut.ts` — `useShortcut(action, handler, deps?)` and `useEscape(handler, enabled?)` hooks
- [x] 2.5 Create `src/shortcuts/index.ts` — barrel export

## 3. Integrate provider into app tree

- [x] 3.1 Mount `<ShortcutProvider>` in `App.tsx` inside `<AppContext>`
- [x] 3.2 Wire `useShortcut('toggleSidebar')` to right panel open/close
- [ ] 3.3 Wire `useShortcut('showShortcuts')` to open Settings → shortcuts tab
- [ ] 3.4 Wire `useShortcut('globalSearch')` — placeholder: focus the chat input or show a search UI (current behavior: activate chat input focus)

## 4. Migrate components to centralized hooks

- [x] 4.1 `Modal.tsx` — replace Escape `useEffect` (lines 53-60) with `useEscape(onClose, open && closeOnEsc)`
- [x] 4.2 `TaskListModal.tsx` — replace Escape `useEffect` (lines 21-27) with `useEscape(onClose)`
- [x] 4.3 `ConfirmProvider.tsx` — replace Escape in `useEffect` (lines 76-90) with `useEscape(() => settle(false), !!pending)`
- [x] 4.4 `TerminalWorkspace.tsx` — remove `Alt+Shift+=` / `Alt+Shift+-` handler (lines 35-78); add `useShortcut` for `newTerminal`, `splitTerminal`, `closePanel`
- [x] 4.5 `AgentRail.tsx` — add `useShortcut('sendMessage')` with agent connection guard; add `useShortcut` for `newTask`, `openSettings`
- [x] 4.6 Verify: `SessionHeader.tsx` and `SettingsModal.tsx` inline rename `onKeyDown` handlers (Escape/Enter on `<input>`) remain unchanged — they are element-level, not window-level

## 5. Rewrite ShortcutsSection in Settings

- [x] 5.1 Replace static `SHORTCUTS` array + `ShortcutsSection` component with interactive editor
- [x] 5.2 Implement platform-aware keybinding chip display using `modLabel(isMac)`
- [x] 5.3 Implement recording mode: click chip → one-shot capture-phase listener → build `KeyBinding` → validate → save via `setShortcuts` → exit recording mode
- [x] 5.4 Implement recording validation: reject modifier-only presses; Escape cancels recording
- [x] 5.5 Implement conflict detection: scan all bindings for duplicates; show ⚠ badge with conflicting action name on affected rows
- [x] 5.6 Implement "Reset to defaults" button with `useConfirm` guard
- [x] 5.7 Read `shortcuts` and `setShortcuts` from `ShortcutContext`

## 6. Add i18n keys

- [x] 6.1 Add `settings.shortcuts.*` keys to `zh-CN.json`: `recordPrompt` (按下按键...), `resetToDefaults` (恢复默认), `resetConfirmTitle`, `resetConfirmBody`, `conflictWarning` (与「{{action}}」冲突), `invalidBinding` (快捷键需包含修饰键), `editHint` (点击修改快捷键)
- [x] 6.2 Add corresponding English translations to `en-US.json`

## 7. Polish and verify

- [x] 7.1 Run `npm run lint` — type-check passes with no errors
- [ ] 7.2 Verify all 10 shortcuts fire correctly on the current platform
- [ ] 7.3 Verify shortcut customization: change a binding in Settings → press new binding → it works; old binding no longer fires
- [ ] 7.4 Verify persistence: change a binding → reload app → custom binding preserved
- [ ] 7.5 Verify conflict detection: set two actions to same binding → warning appears
- [ ] 7.6 Verify escape stack: open Settings → open confirm inside → Esc closes confirm only → Esc closes Settings
- [ ] 7.7 Verify xterm focus: focus terminal → ⌘D splits pane, ⌘, opens settings, typing 'd' goes to terminal
- [ ] 7.8 Verify PTY fix: switch between terminal tabs rapidly → no disconnects
- [ ] 7.9 Verify IME safety: compose CJK text → Enter commits composition, does not send
- [ ] 7.10 Verify recording mode: click chip → press combo → saved; click chip → press Esc → cancelled
