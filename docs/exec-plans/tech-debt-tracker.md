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
- [ ] Embedded terminal (PTY) is **host-bound** (spawns `powershell.exe`/`$SHELL`
      on the Windows host). The WSL-remote goal needs a WSL shell at the project
      path; planned as a `wsl.exe` launch profile, not yet built. — discovered
      2026-05-31 in add-project-sessions exploration — see
      [`../../openspec/changes/add-wsl-remote/proposal.md`](../../openspec/changes/add-wsl-remote/proposal.md)
- [ ] Project scopes **only the agent session list**, not the terminal cwd /
      namespace. Switching project does not re-scope the embedded terminal;
      desirable once WSL projects exist (a WSL project should yield WSL terminals
      at that path). — discovered 2026-05-31 in add-project-sessions design (D4) —
      see [`../../openspec/changes/add-project-sessions/design.md`](../../openspec/changes/add-project-sessions/design.md)
- [ ] Multi-live-session **memory eviction** (drop buffer + close stream for idle
      non-active sessions, reload from history on revisit). If the first cut ships
      without it, in-memory buffers + SSE streams grow unbounded with session
      count. — discovered 2026-05-31 in add-project-sessions design (D2) — see
      [`../../openspec/changes/add-project-sessions/design.md`](../../openspec/changes/add-project-sessions/design.md).
      **2026-06-01 implementation note**: eviction's revisit-restore reuses
      `switchSession` (openAgentSession + history rebuild), so it is gated on the
      sidecar `GET /history` endpoint *and* on only evicting `idle && !active`
      sessions (a `running` session's in-flight delta is not in the persisted
      transcript). Until history ships, evicting makes a revisited session blank —
      so this stays sidecar-blocked, not a quick local win.
- [x] **Subscribe race (B1)**: in `SessionProvider`'s subscribe effect, a rapid
      remove→re-add of the same session id inside the async `listen()` window can
      drop one set of unlisten fns (listener leak / duplicate dispatch). —
      discovered 2026-05-31 in add-project-sessions review — closed 2026-06-01 by a
      per-id generation counter (`subGenRef`): an in-flight subscribe whose slot
      was torn down or superseded unlistens itself on resolve. See
      `src/session/SessionProvider.tsx`.
- [x] **Reconnect stale session (B3)**: `useAgentConnection`'s reconnect path
      mints a *new* session id, and (post multi-live refactor) the dead one
      lingered in the switcher. — discovered 2026-05-31 in add-project-sessions
      review — closed 2026-06-01 in the store: `SessionProvider` tracks the
      bootstrap id (`bootstrapRef`) and *replaces* it on change, pruning the stale
      id from live sessions / runtimes / scratch. The connection hook is unchanged;
      a full health/session decoupling remains future work in `add-wsl-remote`.
      See `src/session/SessionProvider.tsx`,
      [`2026-06-01-project-aware-agent-connection.md`](2026-06-01-project-aware-agent-connection.md).
- [ ] **`tool_call_done` output/error (C1)**: the Rust bridge now best-effort
      forwards `output`/`error` from the sidecar's `tool_call_done` SSE event
      (omitted when absent → no regression for older sidecars), and the TS handler
      already consumes them. Remaining half is the **sidecar contract**: it must
      actually emit `output` (and `error` on failure) on `tool_call_done`, else
      tool results stay invisible. Tracked in `workhorse-agent-tasks.md`. —
      discovered 2026-05-31 in add-project-sessions review; Rust side closed
      2026-06-01 — see `src-tauri/src/agent/mod.rs`, `src/session/events.ts`
- [x] **Permission decision targets active session (C3)**: `decidePermission`
      routed to the active session; a card raised in A but answered after switching
      to B could mis-target. — discovered 2026-05-31 in add-project-sessions review
      — closed 2026-06-01: `decidePermission` now resolves the owning session by
      scanning `runtimes` for the request id and targets that session. See
      `src/session/SessionProvider.tsx`.

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
