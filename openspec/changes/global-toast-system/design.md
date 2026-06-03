## Context

The app uses React Context + `useState` for all state (no external state library). The existing `ConfirmProvider` establishes an imperative pattern: a provider mounted at the app root exposes a hook (`useConfirm()`) that returns a function returning a `Promise`. Toast follows the same architectural pattern.

The design system (`docs/DESIGN.md`) already allocates `--z-toast: 70` in the stacking scale and defines semantic colors (`success`, `warning`, `danger`, `accent-warm`) with a `surface` background token. The `motion` library is a declared dependency with existing presets in `src/motion.ts`. The design philosophy is low-elevation: no shadows, 1px outlines for separation, flat surfaces.

## Goals / Non-Goals

**Goals:**

- Provide a single `useToast()` hook usable from any component without prop-drilling.
- Render transient feedback for success, info, warning, and error outcomes.
- Match the existing warm terracotta design aesthetic (neutral surface + semantic color accent).
- Animate enter/exit consistently with the rest of the app's motion language.
- Integrate toast calls at all action sites identified in the proposal.

**Non-Goals:**

- Persistent notification center or notification history.
- Custom toast content (images, progress bars, action buttons inside toasts). Plain text only.
- Toast queuing / rate-limiting (the 5-toast cap is sufficient).
- Server-sent toast push (all toasts fire from client-side action handlers).
- Changes to DESIGN.md or new design tokens (all needed tokens exist).

## Decisions

### D1: Imperative provider pattern (same as ConfirmProvider)

Toast state lives in a `ToastProvider` React Context. The provider renders a fixed-position container at the top-right. The hook `useToast()` returns `{ toast }` where `toast(options)` pushes a new toast into the queue.

**Alternative considered:** Zustand external store. Rejected — the project uses Context exclusively and the ConfirmProvider precedent is well-understood. No need for a second state paradigm.

**Alternative considered:** `eventEmitter`-based (no React tree dependency). Rejected — breaks the React lifecycle pattern and makes testing harder.

### D2: Visual style — neutral surface + left color bar

Toast cards use `surface` background with a 3px left border in the semantic color. A small icon (✓ / ℹ / ⚠ / ✕) precedes the message text. The card has 1px `outline` in `outline` color, matching the design system's flat elevation style.

```
┌────────────────────────────────────┐
│▌ ✓  项目 "demo" 已删除              │
└────────────────────────────────────┘
 ▲                                   │
 3px semantic color    surface bg    │
                       1px outline   │
```

**Alternative considered:** Fully colored background (green/red/amber fill). Rejected — conflicts with the low-elevation, understated aesthetic. The left-bar approach is visually quieter while still communicating severity.

### D3: Auto-dismiss timing

| Level    | Auto-dismiss | Reasoning                              |
|----------|-------------|----------------------------------------|
| success  | 3 s         | Confirmatory, low urgency              |
| info     | 3 s         | Same as success                        |
| warning  | 5 s         | Needs more reading time                |
| error    | Manual only  | User must acknowledge the failure      |

Max stack size: 5. When a 6th toast arrives, the oldest is dismissed immediately (regardless of its remaining timer).

### D4: Animation — slide from right

Reuse the existing `EASE` curve (`[0.16, 1, 0.3, 1]`) from `src/motion.ts`. Add a new `TOAST` preset:

```ts
export const TOAST = {
  duration: 0.22,
  ease: EASE,
  enter: { opacity: 0, x: 40 },
  exit: { opacity: 0, x: 40 },
} as const;
```

Enter: slide from right (x: 40 → 0) + fade in. Exit: slide to right (x: 0 → 40) + fade out. Duration slightly longer than TAB (0.12) but shorter than PANEL (0.18) — toasts are mid-sized elements.

### D5: File structure

Single file `src/components/ToastProvider.tsx` containing:

- `ToastProvider` (context provider + render container)
- `useToast()` hook
- `ToastItem` (individual toast card component)
- `ToastContainer` (fixed-position stacking layout)

No separate hook file — the provider is small enough to keep co-located, matching `ConfirmProvider.tsx` which also keeps context + hook + dialog in one file.

### D6: Provider nesting

Mount inside `App.tsx` above `ConfirmProvider` so toasts render even during confirmation:

```
<AppContext> → <SessionProvider> → <ToastProvider> → <ConfirmProvider> → [app]
```

This ensures a toast fired during confirm resolution is visible.

## Risks / Trade-offs

- **[Toast flood]** → Mitigated by 5-toast cap. If the agent rapidly fires errors, old toasts auto-dismiss and the user sees the latest batch.
- **[Toast over confirm dialog]** → By design. The toast layer (`z-toast: 70`) is above confirm (`z-confirm: 60`). A success toast after confirming delete should be visible over the closing dialog backdrop.
- **[Timer accuracy on background tab]** → Not a concern for a desktop Tauri app — the renderer process is always active.
- **[No custom content]** → Plain text only for v1. If richer toasts are needed later, the `toast()` options can be extended without breaking the API.
