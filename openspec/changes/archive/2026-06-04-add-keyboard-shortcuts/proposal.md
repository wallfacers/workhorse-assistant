## Why

The app displays a keyboard shortcut reference in Settings but **none of the shortcuts actually work**. Every shortcut (⌘N new task, ⌘K search, ⌘D split terminal, etc.) is dead — only `Enter` in the chat textarea and per-component ad-hoc Escape listeners function. Two bugs compound this: (1) the terminal split shortcut is `Alt+Shift+=` instead of the intended `⌘D`, and (2) clicking on terminal tabs can cause PTY disconnection due to a `display:none` layout measurement race in `TerminalGroup`.

Shortcuts are a core productivity expectation for any desktop tool. VS Code, iTerm2, Warp, and Obsidian all ship a centralized, platform-aware shortcut system with recording-mode customization. This change brings Workhorse Assistant to parity.

## What Changes

- **Centralized shortcut system.** A new `ShortcutProvider` (React Context) with a single global `keydown` listener. All shortcut dispatching flows through one place — no more ad-hoc `window.addEventListener('keydown', ...)` scattered across components.
- **Platform-aware modifiers.** macOS uses `⌘` (metaKey), Windows/Linux uses `Ctrl` (ctrlKey). Display and matching both adapt.
- **10 working shortcuts.** ⌘N new task, ⌘K global search, ⌘, open settings, ⌘W close panel, ⌘\ toggle sidebar, ⌘T new terminal, ⌘D split terminal, ⌘Enter send message, ⌘/ show shortcuts, Esc cancel/close.
- **Customizable keybindings.** Settings → Shortcuts → click a binding chip → recording mode captures the next key combo. Conflicts are detected and warned. Changes persist to localStorage and take effect immediately.
- **Escape stack.** Modals, confirms, and inline edits push/pop handlers on a LIFO stack so Esc always closes the topmost overlay first — matching OS-level dialog behavior.
- **PTY fix.** Two-line `offsetParent` guard in `TerminalGroup.tsx` prevents zero-rect measurements when a terminal group is hidden via `display:none` during tab switches.

## Capabilities

### New Capabilities

- `keyboard-shortcuts`: Centralized `ShortcutProvider`, `useShortcut()` and `useEscape()` hooks, platform detection, configurable keybindings with localStorage persistence, recording-mode UI, conflict detection, and xterm focus scoping.

### Modified Capabilities

- `multi-terminal-workspace`: PTY `display:none` race fix; `Alt+Shift+=` split replaced with `useShortcut('splitTerminal')`; `⌘T` new terminal; `⌘W` close pane.
- `settings-panel`: `ShortcutsSection` rewritten from static display to interactive keybinding editor with recording mode, conflict warnings, and reset-to-defaults.
- `modal-system`: Each modal's ad-hoc Escape listener replaced with `useEscape()` feeding the shared LIFO escape stack.
- `agent-rail-chat`: `Enter`-to-send extracted to `useShortcut('sendMessage')`; `⌘N` and `⌘,` wired to task list and settings modals.

## Impact

- **Renderer only** — no Rust, no IPC, no sidecar changes.
- New files: `src/shortcuts/types.ts`, `src/shortcuts/platform.ts`, `src/shortcuts/ShortcutProvider.tsx`, `src/shortcuts/index.ts`, `src/hooks/useShortcut.ts`.
- Modified files: `App.tsx`, `TerminalGroup.tsx`, `TerminalWorkspace.tsx`, `AgentRail.tsx`, `Modal.tsx`, `TaskListModal.tsx`, `ConfirmProvider.tsx`, `SettingsModal.tsx`, `en-US.json`, `zh-CN.json`.
- No new dependencies. All existing patterns (React Context, `motion`, Tailwind, localStorage, i18n) are reused.
