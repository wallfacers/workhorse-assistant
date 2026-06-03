## Context

The renderer is a React 19 + Tailwind v4 app inside a Tauri frameless window (Chromium WebView2 on Windows, WebKit on macOS). `motion@12.40.0` is already installed but unused. The terminal workspace uses a **two-layer architecture** (`TerminalGroup.tsx`): a geometry layer (`react-resizable-panels`) for split structure, and a terminal layer (absolutely positioned `PaneCard`s over placeholder boxes). This separation exists to keep PTY sessions alive across layout changes — animation must not break it.

Four UI transitions are hard cuts today:
1. Right panel — ternary mount/unmount (`App.tsx:111`)
2. Tab items — direct map render (`TabBar.tsx`)
3. Tab content — `hidden` class (`TerminalWorkspace.tsx:112`)
4. Split panes — instant geometry restructure (`TerminalGroup.tsx`)

Constraints: PTY sessions must never be remounted; `react-resizable-panels` must not be replaced or bypassed; animation must run at 60fps on the Tauri WebView.

## Goals / Non-Goals

**Goals:**
- Smooth (60fps) animations for all four transition types.
- Unified motion language — same easing, same duration family, same scale factor.
- PTY survival guaranteed — Terminal components never unmount during animation.
- Motion library activated — `motion/react` used throughout; no additional animation libraries.

**Non-Goals:**
- No spring/physics-based animations (keep it simple and deterministic).
- No change to `react-resizable-panels` internals or API.
- No animation on drag-resize (the Separator handles are already smooth via the library).
- No layout animation on the chat panel (left panel) — out of scope.
- No animation tokens in `docs/DESIGN.md` — timing is code, not design tokens.

## Decisions

### D1 — Use `motion` (`motion/react`) exclusively

All animations use `motion` v12 from `motion/react`. No raw CSS `@keyframes`, no `framer-motion` legacy import, no other libraries.
**Why:** `motion` is already installed; `AnimatePresence` handles exit animations cleanly; `layout` prop handles tab reflow without manual FLIP. **Alternative:** pure CSS transitions — rejected because exit animations require `AnimatePresence` (keeping the element mounted during the out-transition), and `layout` animation requires FLIP calculations that `motion` does for free.

### D2 — Shared animation preset

A single object defines the motion language:

```ts
// src/motion.ts (or inline in each file)
export const PANEL = {
  duration: 0.3,
  ease: [0.4, 0, 0.2, 1],  // Material standard ease-out
} as const;

export const TAB = {
  duration: 0.2,
  ease: [0.4, 0, 0.2, 1],
  enter: { opacity: 0, scale: 0.85 },
  exit: { opacity: 0, scale: 0.85 },
} as const;

export const FADE = {
  duration: 0.2,
  ease: 'easeOut',
} as const;

export const SPLIT = {
  duration: 0.25,
  ease: [0.4, 0, 0.2, 1],
  enter: { opacity: 0, scale: 0.96 },
  exit: { opacity: 0, scale: 0.96 },
} as const;
```

**Why:** Consistency — every animation uses the same curve `[0.4, 0, 0.2, 1]` (Material standard ease-out, fast start → smooth stop). Duration varies by context: panels are slower (300ms, larger motion), tabs faster (200ms, smaller motion), splits in between (250ms). **Alternative:** use `transition-timing-function` in CSS — rejected because `motion` manages transitions declaratively and CSS would be a second system to keep in sync.

### D3 — Right panel: width animation with overflow clip

The panel is wrapped in a `motion.div` that animates `width: 0 → auto` with `overflow: hidden`. The inner `RightPanel` stays at full width and gets clipped.
**Why:** The layout uses `flex-1` on the main Group, so as the panel's width changes, the Group smoothly resizes in sync — no separate coordination needed. `width: auto` lets `motion` measure the natural width (which varies by breakpoint: 340–600px). **Alternative:** `transform: translateX()` — GPU-accelerated but breaks flex layout sync; the Group would jump after the animation ends. **Alternative:** `scaleX` — distorts content, unacceptable.

### D4 — Open button: always rendered, opacity-toggled

The `[>]` open button is no longer part of the ternary. It stays mounted with `motion.div animate={{ opacity }}` and `pointer-events: none` when the panel is open.
**Why:** Avoids AnimatePresence complexity for a simple fade. The button fades out (150ms) as the panel opens, fades back in when it closes.

### D5 — Tab items: AnimatePresence + layout

Each tab in `TabBar.tsx` is wrapped in `motion.div` with `layout` and included in `AnimatePresence`. Enter: opacity + scale from 0.85. Exit: opacity + scale to 0.85. `layout` handles the automatic reflow when tabs are added/removed.
**Why:** `layout` is the simplest way to get smooth tab reordering — it automatically animates position changes. Scale 0.85 is subtle enough to not look cartoonish but visible enough to register. **Alternative:** animate `width` from 0 — rejected because tabs have variable text widths and width-from-zero would cause text reflow.

### D6 — Tab content: opacity cross-fade, all groups mounted

Replace the `hidden` class in `TerminalWorkspace.tsx` with `motion.div` controlling `opacity` and `pointer-events`. All groups stay mounted at all times.
**Why:** PTY sessions must survive tab switches — `display: none` is safe (xterm keeps running) but prevents CSS transitions. Opacity cross-fade gives a smooth handoff. Duration 200ms is short enough to feel instant but long enough to register. **Risk:** multiple xterm canvases rendering while invisible — acceptable on desktop hardware; WebKit/WebView2 handles off-screen canvas efficiently.

### D7 — Split pane: terminal-layer animation only, geometry stays instant

The geometry layer (`react-resizable-panels`) restructures instantly as before. Only the terminal layer's `PaneCard` wrappers get `motion.div` with enter/exit animations (opacity + scale 0.96).
**Why:** The geometry layer must be instant so `ResizeObserver` can measure new placeholder positions in one frame. The terminal layer then positions PaneCards at the new coordinates and `motion` handles the visual transition. Scale 0.96 (vs 0.85 for tabs) because panes are larger — a subtle scale reads better on bigger surfaces. **Alternative:** animate the geometry layer — rejected because `react-resizable-panels` doesn't expose animated panel creation and hacking it would break the library's internal state.

### D8 — Deferred close for split panes

Closing a pane uses a two-phase approach: (1) set `closingPaneId` in local state, triggering the exit animation on that PaneCard; (2) on `onAnimationComplete`, dispatch `closePane` to the reducer and clear `closingPaneId`.
**Why:** The reducer is synchronous — dispatching `closePane` immediately removes the pane from the layout tree and the PaneCard unmounts before any exit animation can play. Deferring the dispatch until after the animation completes lets the user see the close transition. **Alternative:** use `AnimatePresence` exit — requires keeping the element in the render tree after the reducer removes it, which conflicts with how `TerminalGroup` reads the layout tree. The local `closingPaneId` state is simpler.

## Risks / Trade-offs

- **Multiple xterm canvases in tab cross-fade** — all groups render while only one is visible. On desktop hardware this is negligible, but could increase GPU memory with many tabs. Mitigation: profile with 5+ tabs; if needed, add a `visibility: hidden` optimization for fully-faded-out groups.
- **`width: auto` measurement in motion** — `motion` renders the panel off-screen to measure `auto` width, which briefly creates a layout flash. Mitigation: `overflow: hidden` on the parent clips the flash; the initial `width: 0` means nothing is visible during measurement.
- **Deferred close race condition** — if the user triggers another action during the close animation, the stale `closingPaneId` could interfere. Mitigation: the deferred dispatch is fast (250ms window); the reducer is the source of truth and the local state is a thin overlay. If stale, the worst case is a no-op (the pane is already gone).
- **`layout` prop on tabs can cause unexpected animations** — if a tab's position changes for any reason (resize, reflow), `motion` will animate it. Mitigation: `layout` only animates `transform`, which is GPU-accelerated; the animation is subtle and typically invisible during normal use.
