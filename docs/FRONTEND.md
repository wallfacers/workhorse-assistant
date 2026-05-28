# FRONTEND.md

Renderer conventions. Read this before touching anything under `src/`.
For visual tokens see [`DESIGN.md`](./DESIGN.md); for process boundaries see
[`../ARCHITECTURE.md`](../ARCHITECTURE.md).

## Stack

- **React 19** — function components only; no class components.
- **TypeScript** — `strict: true`; no `any` outside `src/ipc/raw.ts` (TBD).
- **Vite 6** — dev server on `1420` (Tauri requirement; do not change).
- **Tailwind v4** — CSS-first config; tokens come from `DESIGN.md` via
  `npm run design:export:css`.
- **lucide-react** — the only icon set.
- **motion** — the only animation library.

## File layout

```
src/
├── main.tsx            # ReactDOM bootstrap
├── App.tsx             # 3-pane shell; routing + theme switch live here
├── components/         # Feature components; one component per file
│   ├── Terminal.tsx    # S0 single embedded PTY (xterm leaf)
│   └── terminal/       # S1 multi-terminal workspace: TerminalWorkspace
│                       #  (useReducer + keyboard shortcuts) + TabBar +
│                       #  ProfileMenu + TerminalGroup (recursive split) +
│                       #  PaneCard (clean card + hover controls);
│                       #  composes the S0 Terminal leaf, no new IPC
├── ipc/                # typed wrappers around tauri `invoke` (Result-shaped)
├── state/              # (TBD) cross-pane state (start with Context; only
│                       #  reach for a store when 2+ panes mutate the same
│                       #  field independently)
├── types.ts            # Renderer-only shared types
└── index.css           # Tailwind entry; @import '../docs/DESIGN.md'-exported
                        # tokens here
```

## Component rules

1. **One component, one file.** File name = component name (PascalCase).
2. **Props are explicit.** No `...rest` spreading except on direct DOM-pass.
3. **No business logic in JSX files.** If a component does network/IPC, it
   imports a function from `src/ipc/` — it does not call `invoke()` directly.
4. **State stays local until proven otherwise.** Lift state only when ≥ 2
   children read it.
5. **Compose, don't configure.** A component with > 8 props is a smell;
   decompose before adding the ninth.

## Styling

- Use Tailwind utility classes. **Do not** write ad-hoc CSS files.
- Use design tokens (CSS variables exported from `DESIGN.md`) via Tailwind's
  `bg-[var(--color-primary)]` syntax or the generated semantic classes.
- Hardcoded hex/rem values in JSX are a lint failure — change `DESIGN.md`.
- Dark mode is `class`-based (`<html class="dark">`). Components consume
  the same token names; **do not** branch on `isDarkMode` inside components.

## State

- **UI ephemera** (open/closed, hover, focus) → `useState`.
- **Cross-pane** (selected conversation, theme) → Context in `src/state/`.
- **Server / IPC cache** → custom hook in `src/ipc/` that owns its own state.
- Avoid `useEffect` for derivations — compute during render.

## IPC

The only sanctioned way to talk to Rust:

```ts
// src/ipc/app.ts
import { invoke } from '@tauri-apps/api/core';

export interface AppInfo {
  name: string;
  version: string;
}

export const getAppInfo = (): Promise<AppInfo> => invoke<AppInfo>('app_info');
```

Rules:

- Every command gets a typed wrapper in `src/ipc/<domain>.ts`.
- Errors are caught at the wrapper and returned as `Result`-shaped values
  (TBD type) — components never `try/catch` `invoke` directly.
- Renderer-side IPC types **mirror** Rust structs. If they drift, that is a
  bug; fix the renderer.

## Accessibility

- All interactive elements are reachable by keyboard.
- Color is never the only signal — pair with icon or text.
- `npm run design:lint` enforces WCAG AA on documented component pairs;
  ad-hoc pairs are the author's responsibility.

## Performance

- Avatars and images: lazy-load + width/height attributes mandatory.
- Long lists: virtualize at ≥ 200 rows.
- Avoid `framer-motion` / `motion` on per-message animation; reserve it for
  shell-level transitions (open/close, route change).

## Testing (TBD)

We do not yet have a test runner wired up. When the first non-trivial
renderer logic lands, the same exec-plan that introduces it must also
introduce the test setup. See [`PLANS.md`](./PLANS.md).
