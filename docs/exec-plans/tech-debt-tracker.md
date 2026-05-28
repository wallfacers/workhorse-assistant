# Tech Debt Tracker

Append-only list of known debt. Add a row the moment you notice the debt —
even mid-PR. Format:

```
- [ ] <one-line description> — discovered YYYY-MM-DD in <context> — see <pointer>
```

When a debt is paid off, mark the box `[x]` and append `— closed by <PR>`.
Do not delete rows; the history is the asset.

## Open

- [ ] Wire `npm run design:export:css` into the dev/build pipeline so the
      `@theme` block in `src/index.css` is regenerated from `docs/DESIGN.md`
      rather than hand-maintained. — discovered 2026-05-25 in initial scaffold
      — see [`../FRONTEND.md`](../FRONTEND.md#styling)
- [ ] Add a test runner (Vitest for renderer, `cargo test` smoke for core).
      Required for any area to claim QUALITY_SCORE ≥ 3. — discovered
      2026-05-25 in initial scaffold — see [`../QUALITY_SCORE.md`](../QUALITY_SCORE.md)
- [ ] Generate the raster icon set from `src-tauri/icons/source.svg` on every
      contributor machine (`npx @tauri-apps/cli icon`). `tauri build` will
      fail without the binaries; the SVG source is committed but the rasters
      are not. — discovered 2026-05-25 in initial scaffold — see
      [`../../src-tauri/icons/README.md`](../../src-tauri/icons/README.md)
- [ ] Run `npm run tauri:dev` end-to-end on the target platforms to confirm
      the scaffold boots. (Tracked here so the next contributor knows it has
      not yet been verified.) — discovered 2026-05-25 in initial scaffold
- [ ] Configurable/custom terminal keyboard shortcuts (this round hard-codes
      `Alt+Shift+±`). — discovered 2026-05-28 in add-resizable-split-layout
      — see [`../../openspec/changes/add-resizable-split-layout/design.md`](../../openspec/changes/add-resizable-split-layout/design.md)
- [ ] Three components still carry Tailwind-palette greys / neutrals
      (`text-gray-*`, `bg-neutral-*`) that have no role-token in
      [`../DESIGN.md`](../DESIGN.md). Decide whether to extend DESIGN.md with
      a documented grey scale or to migrate these usages to existing role
      tokens. — discovered 2026-05-25 in initial scaffold
- [ ] Token **value drift**: `src/index.css`'s hand-written `@theme` block has
      diverged from `docs/DESIGN.md` values (e.g. `outline` `#C4CCD3`→`#e5e7eb`,
      `surface-dark` `#101012`→`#161618`) and adds CSS-only tokens (`canvas-dark`,
      `surface-dark-elevated`, `outline-strong`) absent from DESIGN.md. Tailwind
      resolves the CSS, so DESIGN.md is no longer authoritative at runtime. Needs a
      dedicated token-audit change to reconcile the two (keeping DESIGN.md as the
      nominal source). — discovered 2026-05-29 in add-three-pane-shell — see
      [`../../openspec/changes/add-three-pane-shell/design.md`](../../openspec/changes/add-three-pane-shell/design.md) (D8)
- [ ] Delete orphan `src/components/MainChat.tsx` (never imported since initial
      commit `edbfeb6`, contains invalid `p-4.5`). — discovered 2026-05-29 in
      add-three-pane-shell review — see `src/components/MainChat.tsx`

## Closed

- [x] Lock down CSP in `src-tauri/tauri.conf.json`. — closed 2026-05-25 by
      this same scaffold change; the config now sets a strict per-source
      policy (no inline scripts; `connect-src` limited to `self` + `ipc:`).
      See [`../SECURITY.md`](../SECURITY.md#content-security-policy).
- [x] Introduce `src/ipc/` typed wrappers; components must not call
      `invoke()` directly. — closed 2026-05-25 by this scaffold change; see
      [`../../src/ipc/`](../../src/ipc/).
- [x] Replace hard-coded hex values in `src/App.tsx` and the three pane
      components with tokens defined in `docs/DESIGN.md`. — closed 2026-05-25
      by this scaffold change; the `@theme` block in `src/index.css` mirrors
      DESIGN.md until `design:export:css` is wired (tracked above).
- [x] Add a CI workflow that runs `npm run lint`, `npm run design:lint`,
      `cargo fmt --check`, `cargo clippy`, and `cargo check` on every PR.
      — closed 2026-05-25 by this scaffold change; see
      [`../../.github/workflows/ci.yml`](../../.github/workflows/ci.yml).
