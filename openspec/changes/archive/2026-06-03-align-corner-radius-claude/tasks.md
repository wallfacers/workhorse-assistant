# Tasks — align-corner-radius-claude

> Purely visual. No behavior/data/API change. Execute groups in order (1→5).
> Reference scale (Claude, measured): inline 6 · icon 8 · control 12 ·
> container 16 · pill full · window 28 (exception). See `design.md`.
>
> **Implementation note:** to keep churn low we KEPT the token key names
> (`xs/sm/md/lg/xl/full`) and changed their VALUES, rather than renaming keys to
> role names. Final mapping: `xs 6 (inline) · sm 8 (icon) · md 12 (control) ·
> lg 16 (container) · xl 28 (window) · full`. Each Tailwind class now maps to
> exactly one role.

## 1. Design source — docs/DESIGN.md

- [x] 1.1 `rounded:` block updated: `none 0 · xs 6 · sm 8 · md 12 · lg 16 · xl 28
      · full 9999` (kept keys, changed values; `lg` is now 16, was 24).
- [x] 1.2 Re-pointed `components.*.rounded`: `message-bubble-*` `md → lg`
      (container); `button-*` / `input-text` `sm → md` (control); panes already
      `lg` (now 16); `app-shell*` stay `xl` (window); `badge-accent` stays `full`.
- [x] 1.3 "Shapes" section rewritten to the role table (container 16, control 12,
      inline 6, icon 8, pill full, window 28 exception).
- [x] 1.4 Concentric-radius rule removed; replaced with a note that containers
      share one radius by design + a "no off-scale radii" Don't.

## 2. Re-export tokens

- [x] 2.1 N/A — the export target (`src/design-tokens.generated.css`) is not wired
      into the build; `src/index.css` `@theme` is the live source. Edited directly.
- [x] 2.2 `src/index.css` `@theme` radii aligned: `--radius-xs 6 · sm 8 · md 12 ·
      lg 16 · xl 28`. Tailwind stock `rounded-*` class names reused (no rename).
- [x] 2.3 `npm run design:lint` green (0 errors; 7 rounding levels).

## 3. Markdown renderer hardcoded radii — src/index.css (D5)

- [x] 3.1 Copy button: `0.25rem → var(--radius-sm)` (8px); comment fixed.
- [x] 3.2 Inline code: `4px → var(--radius-xs)` (6px); comment added.
- [x] 3.3 Table outer frame: `12px → var(--radius-lg)` (16px); wrong comment fixed.
- [x] 3.4 Code-block container: `1rem → var(--radius-lg)` (16px); comment fixed.

## 4. Component audit — src/components/**/*.tsx (D6)

- [x] 4.1 Listed all ~100 usages across 17 files.
- [x] 4.2 Re-mapped each by role (container `rounded-lg`, control `rounded-md`,
      icon `rounded-sm`, pill/dot `rounded-full` untouched). Done via 4 parallel
      agents; final distribution: lg 40 · md 39 · full 16 · sm 15 · xl 2.
- [x] 4.3 `rounded-[12px]`, `rounded-2xl` magic numbers eliminated.
- [x] 4.4 Window root (`App.tsx:84` `rounded-xl`) confirmed intact (28px). Stale
      `rounded-xl` comment in `TabBar.tsx` also corrected.

## 5. Verify

- [x] 5.1 `npm run lint` (tsc) — no new errors. (One pre-existing, unrelated error
      remains: `src/ipc/dialog.ts` missing `@tauri-apps/plugin-dialog` — a stale
      `node_modules`, fixed locally with `npm install`; not part of this change.)
- [x] 5.2 `npm run dev` + browser screenshot — confirmed panes/terminal frame at
      16, "New session" button + tab at 12, avatars/dots full, restrained Claude
      feel. ("Failed to start terminal" is expected outside Tauri.)
- [~] 5.3 AI chat markdown (code block / table / inline code) verified at CSS/code
      level; not exercised in the running app (mock mode shows no live markdown
      conversation to trigger them).
- [x] 5.4 `npm run design:lint` green; no raw-palette regressions introduced.
