# AGENTS.md — Map of the Workhorse Assistant repository

> This file is a **map**, not a manual. It is intentionally short.
> The repository itself is the system of record; deeper context lives in
> [`docs/`](./docs). Follow the pointers below.

## Identity

- **Name:** Workhorse Assistant
- **Kind:** Cross-platform desktop AI assistant
- **Stack:** Tauri v2 (Rust) · React 19 · Vite 6 · Tailwind v4 · TypeScript
- **Identifier:** `com.workhorse.assistant`

## Boundaries

- ✅ The renderer (`src/`) owns presentation, navigation, ephemeral state.
- ✅ The backend (`src-tauri/`) owns secrets, file system, network, OS APIs.
- ❌ Never call third-party APIs or read user files directly from the renderer.
  Route every privileged operation through a Rust `#[tauri::command]`.

## Commands

| Task | Command |
| --- | --- |
| Install deps | `npm install` |
| Type-check | `npm run lint` |
| Renderer dev (browser) | `npm run dev` |
| Desktop dev (Tauri) | `npm run tauri:dev` |
| Production build | `npm run tauri:build` |
| Lint design tokens | `npm run design:lint` |
| Export tokens → CSS | `npm run design:export:css` |

See [`README.md`](./README.md) for prerequisites and first-time setup.

## Knowledge Map

Read the document that matches the work you are about to do. Do not read them
all up front.

### Top of the tree
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — Domain & package layering.
- [`docs/DESIGN.md`](./docs/DESIGN.md) — Design tokens (Google DESIGN.md format).
- [`docs/FRONTEND.md`](./docs/FRONTEND.md) — React/Tailwind/IPC conventions.
- [`docs/PLANS.md`](./docs/PLANS.md) — How to write & run an exec-plan.
- [`docs/PRODUCT_SENSE.md`](./docs/PRODUCT_SENSE.md) — Product taste & vision.
- [`docs/QUALITY_SCORE.md`](./docs/QUALITY_SCORE.md) — Per-area quality rubric.
- [`docs/RELIABILITY.md`](./docs/RELIABILITY.md) — Error budgets, recovery.
- [`docs/SECURITY.md`](./docs/SECURITY.md) — Threat model & permissions.

### Catalogs
- [`docs/design-docs/index.md`](./docs/design-docs/index.md) — Indexed design decisions with validation status.
- [`docs/design-docs/core-beliefs.md`](./docs/design-docs/core-beliefs.md) — Non-negotiable principles.
- [`docs/product-specs/index.md`](./docs/product-specs/index.md) — Active product specs.
- [`docs/exec-plans/active/`](./docs/exec-plans/active/) — Plans currently being executed.
- [`docs/exec-plans/completed/`](./docs/exec-plans/completed/) — Historical, append-only.
- [`docs/exec-plans/tech-debt-tracker.md`](./docs/exec-plans/tech-debt-tracker.md) — Outstanding debt.

### References & generated artefacts
- [`docs/references/`](./docs/references/) — Third-party `*-llms.txt` snapshots.
- [`docs/generated/`](./docs/generated/) — Machine-generated; do not hand-edit.

## Hard Rules

1. **Treat the repo as the system of record.** If a fact is not in code or in
   `docs/`, it does not exist for the agent. Update docs in the same change.
2. **DESIGN.md is the source of truth for visual tokens.** Do not hand-tune
   colors / spacing / radius elsewhere — change `docs/DESIGN.md` and re-export.
3. **No secrets in the renderer.** API keys and tokens live in Rust only.
4. **No long monoliths.** When a file exceeds ~400 lines, plan a decomposition
   in [`docs/exec-plans/active/`](./docs/exec-plans/active/) before continuing.
5. **Plans before non-trivial work.** Anything spanning >1 file or >1 hour
   gets a written exec-plan first; lightweight changes do not.
6. **Type-check is a gate.** `npm run lint` must pass before any commit.

## When in doubt

- Stuck on architecture? → [`ARCHITECTURE.md`](./ARCHITECTURE.md).
- Stuck on visuals? → [`docs/DESIGN.md`](./docs/DESIGN.md).
- Stuck on "should I even build this?" → [`docs/PRODUCT_SENSE.md`](./docs/PRODUCT_SENSE.md).
- Stuck on "is this safe to ship?" → [`docs/SECURITY.md`](./docs/SECURITY.md) + [`docs/RELIABILITY.md`](./docs/RELIABILITY.md).
