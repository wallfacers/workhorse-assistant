## Why

Four high-frequency UI transitions are currently hard cuts with zero animation:

1. **Right panel (工作台) open/close** — `App.tsx` line 111 uses a ternary that mounts/unmounts `<RightPanel>` instantly.
2. **Terminal tab add/close** — `TabBar.tsx` maps groups directly; new tabs appear and vanish with no transition.
3. **Terminal tab content switch** — `TerminalWorkspace.tsx` line 112 uses `hidden` (display:none) to toggle group visibility; no cross-fade.
4. **Terminal split pane (分屏) open/close** — `TerminalGroup.tsx` restructures the geometry layer instantly; PaneCards teleport to new positions.

The result feels jarring — every layout change is a flash-cut. Users expect desktop-grade smoothness (like VS Code's panel animations). The `motion` library (`motion@^12.23.24`) is already declared in `package.json` but has **zero imports** in the entire codebase; this change puts it to use.

## What Changes

- **Right panel slide-in/out.** Wrap the panel in `AnimatePresence` + `motion.div` so it expands (width 0 → target) and fades in; the reverse on close. The `flex-1` Group shrinks in sync.
- **Tab enter/exit animation.** Each tab in `TabBar.tsx` gets `motion.div` with `layout` (automatic reflow) and enter/exit keyframes (opacity + scale).
- **Tab content cross-fade.** Replace the `hidden` class in `TerminalWorkspace.tsx` with motion-controlled opacity. All groups stay mounted (PTY survival); the inactive layer is `opacity: 0` + `pointer-events: none`.
- **Split pane enter/exit animation.** PaneCards in `TerminalGroup.tsx`'s terminal layer get `AnimatePresence` + `motion.div`. New panes fade+scale in; closing panes need a deferred-close mechanism (animate first, then dispatch `closePane`).
- **Shared animation constants.** One place for duration, easing, and scale values so all four animations feel unified.

## Capabilities

### New Capabilities

- `motion-transitions`: A shared animation preset (duration, easing curve, scale factor) and the convention that all `motion` imports come from `motion/react`. Covers the right panel, tabs, tab-content, and split-pane animations described above.

### Modified Capabilities

- `add-multi-terminal-workspace`: TabBar gains enter/exit animations on tab items; TerminalWorkspace gains cross-fade between groups; TerminalGroup gains enter/exit animations on split PaneCards.
- `three-pane-shell`: The right panel (`RightPanel`) in `App.tsx` gains a slide-in/slide-out transition instead of a hard mount/unmount.

## Impact

- **Renderer only** — no Rust, no IPC, no sidecar changes.
- Files touched: `App.tsx`, `TabBar.tsx`, `TerminalWorkspace.tsx`, `TerminalGroup.tsx`. Optionally a new `src/motion.ts` (or inline in each file) for shared constants.
- `motion` is already a dependency — no new packages.
- PTY sessions are never remounted (the two-layer architecture in TerminalGroup is preserved; animation is purely visual).
- No visual-token changes (DESIGN.md stays untouched — animation timing is not a design token per CLAUDE.md's definition).
