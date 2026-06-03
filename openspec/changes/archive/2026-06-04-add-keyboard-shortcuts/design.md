## Context

The app uses React Context for all shared state (`AppContext`, `ConfirmProvider`, `ToastProvider`, `SessionProvider`). There is no external state library. The `motion` library handles animations. localStorage persists user preferences with a `workhorse:` key prefix.

The terminal workspace uses a two-layer architecture (`TerminalGroup.tsx`): a geometry layer (react-resizable-panels) and a terminal layer (absolutely-positioned PaneCards). Inactive groups are hidden with `display:none` + `pointerEvents:none` to keep PTY sessions alive while avoiding layout cost.

Existing keyboard handling is fragmented: `Modal.tsx`, `TaskListModal.tsx`, `ConfirmProvider.tsx`, `TerminalWorkspace.tsx` each attach their own `window.addEventListener('keydown', ...)`. There is no central dispatcher and no platform awareness.

## Goals / Non-Goals

**Goals:**

- One global `keydown` listener dispatching through a handler registry — no component-level window listeners for shortcuts.
- Platform detection (`isMac()`) so `⌘` fires on macOS and `Ctrl` on Windows/Linux.
- Shortcut customization via recording mode in Settings: click → press keys → saved.
- Conflict detection: if two actions share a binding, both are saved but a warning is shown; only the first-registered handler fires.
- Escape as a LIFO stack: the most recently opened overlay closes first.
- PTY sessions survive tab switches without zero-rect layout thrashing.

**Non-Goals:**

- Multi-key chord sequences (e.g. `⌘K ⌘S`). Single chord only.
- Per-application-scope shortcuts (e.g. "only in terminal", "only in chat"). Everything is global with xterm focus awareness — terminal-scoped shortcuts still fire when xterm is focused.
- System-level global shortcuts (Tauri `globalShortcut`). These are app-internal navigation shortcuts; they should NOT fire when another app has focus.
- Shortcut import/export or preset schemes. Just localStorage persistence.
- Changes to xterm's own key handling (`attachCustomKeyEventHandler` for Ctrl+C/V). That remains independent.

## Decisions

### D1: Centralized ShortcutProvider over distributed listeners

A single `ShortcutProvider` mounts at the app root. It owns the only `window.keydown` listener (excluding xterm's `attachCustomKeyEventHandler` which is xterm-internal). Components register handlers via `useShortcut(action, handler)`.

```
┌────────────────────────────────────────────────────┐
│                  ShortcutProvider                   │
│                                                    │
│  window.keydown ──▶ match against registry ──▶ handler()
│                                                    │
│  Registry: Map<ShortcutAction, () => void>         │
│  Escape stack: Array<{ id: Symbol, fn }>           │
│  Config: ShortcutConfig (from localStorage)        │
└────────────────────────────────────────────────────┘
        ▲                ▲                ▲
        │                │                │
   useShortcut()    useEscape()    setShortcuts()
   (components)     (components)   (Settings UI)
```

**Alternative:** Each component keeps its own `window.keydown` — rejected. The current state proves this doesn't scale. Escape ordering across modals is impossible without a shared stack. Conflict detection across components is impossible without a registry.

**Alternative:** Rust `globalShortcut` — rejected. These are in-app navigation shortcuts, not system-wide hotkeys. Tauri's `globalShortcut` would steal keys from other apps when Workhorse is in background.

### D2: Recording mode for customization (VS Code / Obsidian pattern)

Each shortcut row in Settings shows a platform-aware keybinding chip. Clicking the chip enters recording mode:

```
Normal state:            Recording state:
┌──────────────────┐     ┌──────────────────────┐
│ 新建任务    ⌘ N   │ ──▶ │ 新建任务  按下按键... │ (pulsing)
└──────────────────┘     └──────────────────────┘
```

A one-shot `keydown` listener in capture phase records the next non-modifier keydown. It builds a `KeyBinding` from `{ mod, alt, shift, code }`. Validation: at least one modifier (mod/alt/shift) unless the key is Escape. Pressing Escape during recording cancels without saving.

**Alternative:** Dropdown selects for modifier + key — rejected. Recording mode is the universal pattern (VS Code, Obsidian, iTerm2, macOS Keyboard Shortcuts prefpane). It's faster and guarantees the binding is physically typeable on the user's keyboard layout.

### D3: Conflict strategy — first-come-first-served with visual warning

When a user attempts to bind a shortcut already used by another action:

1. The binding is **accepted** (both actions keep the binding).
2. Both conflicting rows show a ⚠ warning badge with the conflicting action's name.
3. At runtime, the **first-registered** handler wins. Since handler registration happens on component mount, the winner is the component that mounts first in the React tree.

This matches VS Code's behavior: conflicts don't block you, but they're clearly surfaced so you can fix them.

**Alternative:** Block conflicting bindings — rejected. This is frustrating when the user deliberately wants to swap two shortcuts. They'd have to unbind one first, then rebind the other — tedious.

**Alternative:** Auto-unbind the old action — rejected. This can silently break muscle memory when the user didn't realize the old binding existed.

### D4: Escape as LIFO stack

Each modal/overlay pushes its close handler onto a stack on mount and pops it on unmount. The global Escape handler calls only the topmost handler.

```
Mount order:    Escape stack:       Press Esc:
Modal A         [closeA]            → closeA (top)
Modal B         [closeA, closeB]    → closeB (top)
Modal B closed  [closeA]            → closeA (top)
Modal A closed  []                  → no-op
```

Inline edit Escapes (SessionHeader rename, Settings inputs) use element-level `onKeyDown` with `e.stopPropagation()` — they don't interact with the escape stack. This prevents an inline rename Escape from closing the parent modal.

Confirmation dialogs push onto the same stack. A confirm over a settings modal: Esc closes the confirm, revealing settings underneath. This matches OS-level dialog behavior.

### D5: PTY fix — `offsetParent` guard

`TerminalGroup.tsx` has a `useLayoutEffect` with **no deps** that calls `measure()` on every render. When a group is hidden via `display:none` (tab switch), `measure()` captures zero rects. The same issue affects the `ResizeObserver` callback.

Fix: guard both with `containerRef.current?.offsetParent` check. `offsetParent` returns `null` when the element or any ancestor has `display:none` — an established pattern already used in `agent/fallbackTools.ts:51` and `useAgentTabTools.ts:222`.

```tsx
// Before (line 108-110):
useLayoutEffect(() => {
  measure();
});

// After:
useLayoutEffect(() => {
  if (!containerRef.current?.offsetParent) return;
  measure();
});

// Same guard for ResizeObserver callback (line 119):
const ro = new ResizeObserver(() => {
  if (!containerRef.current?.offsetParent) return;
  measure();
});
```

No other files change. This preserves the intentional no-deps `useLayoutEffect` pattern while preventing zero-rect measurements from hidden groups.

### D6: File structure

```
src/shortcuts/
├── types.ts              # ShortcutAction, KeyBinding, DEFAULT_SHORTCUTS, helpers
├── platform.ts           # isMac(), modLabel(), modDisplay()
├── ShortcutProvider.tsx   # Context, provider, global keydown, escape stack, persistence
└── index.ts              # Barrel export

src/hooks/
└── useShortcut.ts        # useShortcut() and useEscape() hooks
```

`types.ts` is separated from the provider so Settings can import defaults and helpers without pulling in React. `platform.ts` is separated for testability. The hooks live in `src/hooks/` following the existing `use-auto-scroll.ts` convention.

### D7: Provider nesting

```
<AppContext>
  <ShortcutProvider>        ← NEW (needs AppContext for agent connection)
    <SessionProvider>
      <ToastProvider>
        <ConfirmProvider>
          [app]
```

ShortcutProvider sits right inside AppContext so `useShortcut('sendMessage')` in AgentRail can access the agent connection through `useApp()`.

## Risks / Trade-offs

- **[IME composition]** → Mitigated: `e.isComposing` guard at the top of the global listener, matching every existing `onKeyDown` in the codebase.
- **[xterm focus detection]** → xterm.js v6 uses the class `xterm-helper-textarea` on its internal textarea. If a future xterm upgrade changes this class, shortcuts stop firing while xterm is focused. Mitigation: the selector is a single string constant in `ShortcutProvider.tsx` — easy to update.
- **[Escape stack order with nested React trees]** → React runs effects child-first on mount, parent-first on unmount. So a child modal's `useEscape` effect runs before its parent modal's, producing the correct push order. On unmount, parent's cleanup runs before child's — but `popEscape(id)` uses a Symbol id so it removes the exact handler regardless of stack position. Order is always correct.
- **[Shortcut conflicts with browser defaults]** → `⌘D` (bookmark), `⌘W` (close tab), `⌘,` (preferences) are all browser shortcuts. `e.preventDefault()` in the global handler overrides them. On macOS, some of these are already captured by the Tauri webview. If any shortcut feels wrong, the user can rebind it in Settings.
- **[Recording mode and system shortcuts]** → During recording, `e.preventDefault()` + `e.stopPropagation()` prevent the captured key from triggering any action. System shortcuts (e.g. `⌘Space` for Spotlight) are handled by the OS before reaching the webview — they won't be capturable, which is correct.
