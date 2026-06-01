# Tasks — add-wsl-remote

> Status: UNBLOCKED (was PARKED). The §A sidecar endpoints (`/health`
> `default_workdir`/`platform`/`distro`, `GET /v1/fs/list`) are now **delivered**
> by `workhorse-agent` `c30f522`, so the assistant-side items (§B/§C) are ready
> to schedule. Delivery order is in [`design.md`](./design.md); the batch-1
> sidecar contract is the standalone
> [`../archive/2026-05-31-add-project-sessions/workhorse-agent-tasks.md`](../archive/2026-05-31-add-project-sessions/workhorse-agent-tasks.md).
>
> Integration gap to close in §B/§C: the assistant's `HealthInfo` (Rust
> `src-tauri/src/agent/mod.rs:96` + TS `src/ipc/agent.ts:107`) does **not** yet
> carry `default_workdir`/`platform`/`distro`, and there is **no `fs/list`
> client** yet.

## A. Sidecar (Go) — batch 2 (WSL enablement) — DELIVERED

> **Delivered by `workhorse-agent` commit `c30f522` (2026-06-01), archived as
> `workhorse-agent/openspec/changes/archive/2026-06-01-add-wsl-remote/`.** The
> three contracts below are now live on the sidecar; the *assistant-side*
> consumption is tracked in §B/§C. Confirmed field names/casing are recorded so
> the assistant must match them exactly.

- [x] A1 `GET /health` returns top-level `default_workdir` (string, non-empty:
      config `server.default_workdir` → `os.Getwd()` fallback). (`internal/api/health.go:51`)
- [x] A2 `GET /health` adds top-level `platform` (always, `runtime.GOOS` →
      `linux`/`windows`/`darwin`) and `distro` (present **only on WSL**, from
      `/etc/os-release` PRETTY_NAME). All snake_case. `capabilities` stays a flat
      `["frontend_tools","external_agents"]` and does NOT carry these scalars —
      they are top-level, as predicted (D-WSL-6). (`internal/api/health.go:52,55-56`)
- [x] A3 `GET /v1/fs/list?path=<dir>` enumerates the sidecar namespace. Actual
      response shape is `{ "path": "<dir>", "entries": [{ "name", "path", "isDir" }] }`
      (note the top-level `path` echo; `isDir` is camelCase). `path` omitted →
      `default_workdir`. Rejects virtual FS (`/proc`,`/sys`,`/dev`,`/run`) and
      paths escaping `default_workdir` with 403; 404 missing; 400 not-a-dir.
      (`internal/api/fs.go:33-93`, route `internal/api/server.go:134`)

## B. Assistant — connection & cold start (needs A1)

- [x] B1 Drop the Rust `attach` host-cwd fallback (`std::env::current_dir()` in
      `src-tauri/src/agent/mod.rs`); empty `workdir` now returns a `validation`
      error instead of defaulting to the host cwd (§1.7 / D-WSL-1).
- [ ] B2 Renderer cold-start precedence: remembered project → `/health
      default_workdir` → project picker (D-WSL-2). Extend `HealthInfo` (Rust
      `src-tauri/src/agent/mod.rs` + TS `src/ipc/agent.ts`) with the now-delivered
      top-level fields `default_workdir` (string) plus optional `platform` and
      `distro` (the latter feeds C2's terminal default). Field names are
      snake_case on the wire; mirror them exactly.
      - [x] B2a Data layer: extended `HealthInfo` (Rust `agent/mod.rs` +
        TS `src/ipc/agent.ts`) with optional `default_workdir`/`platform`/`distro`
        (`#[serde(default)]`, backward-compatible). `cargo check` + `tsc` clean.
      - [x] B2b Cold-start precedence in `SessionProvider`: `useAgentConnection`
        now exposes `defaultWorkdir`/`platform`/`distro` from the probe; the
        bootstrap effect resolves remembered `currentProject` → `defaultWorkdir`
        (adopted via `openProject`) → otherwise wait for the picker. No empty
        attach (pairs with B1). `cargo check` + `tsc` clean.
- [x] B3 Full health/session decoupling (D-WSL-4): `useAgentConnection` → pure
      health probe (no `attachAgentSession`, no `sessionId`); `SessionProvider`
      owns bootstrap creation on `connected`; per-live-session
      `connection_failed` → `reopenAgentSession(id)` re-subscribe (not re-create).
      Update `SettingsModal` / `AgentRail` status text that read `agent.sessionId`.
      **Done 2026-06-01** (ahead of batch 2 — it does not need `default_workdir`;
      an empty remembered project still uses the Rust host-cwd fallback until B1).
      Rust `subscribe` now heals a given-up reader via an `alive` flag so a reopen
      re-spawns the SSE thread. Fixed the "stuck 连接中…" loop where
      `connection_failed` minted a brand-new session every cycle. See
      [`../../../docs/exec-plans/active/2026-06-01-decouple-health-from-session.md`](../../../docs/exec-plans/active/2026-06-01-decouple-health-from-session.md).
- [x] B4 Settings: editable agent endpoint + reconnect. Rust `AgentBridge::set_endpoint`
      (validates `http(s)://host[:port]`, trims trailing slash) + `current_endpoint`,
      exposed as `agent_set_endpoint`/`agent_get_endpoint` commands and
      `setAgentEndpoint`/`getAgentEndpoint` IPC wrappers. SettingsModal's endpoint
      field is now an input with "Save & reconnect" (saves → `agent.reconnect()`),
      shows the validation error inline. Live sessions on the previous endpoint
      are not migrated (V1). Rust validation test added. `cargo test` (12) + `tsc` clean.

## C. Assistant — project picker & terminal (A2/A3 now delivered)

- [ ] C1 Namespace-correct project browser backed by `GET /v1/fs/list`
      (replaces today's manual path entry; local recents stay as a fast path).
      Confirmed contract: `{ "path": "<dir>", "entries": [{ "name", "path", "isDir" }] }`
      (`isDir` camelCase; `path` omitted → sidecar `default_workdir`).
      - [x] C1a Data layer: `agent_fs_list` Rust command (`lib.rs` +
        `AgentBridge::fs_list` in `agent/mod.rs`, mapping 404→not_found,
        400/403→validation) + `fsList(path?)` IPC wrapper with `FsEntry`/`FsListing`
        types, re-exported from `src/ipc/index.ts`. `cargo check` + `tsc` clean.
      - [x] C1b Browser UI: `src/components/ProjectBrowser.tsx` — a sidecar-namespace
        folder navigator (starts at `default_workdir`, parent/into navigation,
        surfaces 403/404/400 messages, "open this folder" → `openProject`). Wired
        into the TitleBar `ProjectSwitcher` as a "Browse folders…" entry alongside
        the manual path input. i18n keys added (zh-CN/en-US). `tsc` clean.
- [x] C2 `wsl` terminal profile: `resolve_profile(profile_id, workdir, distro)`
      now takes the project + distro; `pty_spawn`/`SessionRegistry::spawn` thread
      them through. The `wsl` profile spawns `wsl.exe [-d <distro>] [--cd <path>]`
      (PTY stays host-side). `wsl` added to the `ProfileId` union (`pty.ts`),
      `PROFILE_LABELS`, and the Rust `match`; kept OUT of `PROFILE_ORDER` (not a
      manual pick — would "command not found" on non-Windows). cwd rule: a WSL
      `workdir` is NOT used as a host cwd (sidecar-namespace path); a local
      `workdir` is. New Rust tests cover both. `cargo check`/`cargo test`/`tsc` clean.
- [x] C3 Project ↔ terminal coupling: `SessionProvider` exposes `agentDistro`;
      `Terminal.tsx` captures `{currentProject, agentDistro}` at spawn time and
      (a) launches a `terminal` pane as `wsl` rooted at the project when the
      sidecar is WSL, (b) passes `workdir` so local terminals open at the project
      path. Captured via a ref so switching projects does not re-spawn existing
      panes — only newly-mounted ones pick up the change. `tsc` clean.

> Remaining: only the §6 manual Windows/WSL acceptance passes (run the desktop
> app against a real WSL sidecar). All implementation — A (sidecar-delivered),
> B1/B2/B3/B4, C1/C2/C3 — is done and unit/type-verified.

## D. Docs / verification

- [ ] D1 Document WSL2 localhost-forwarding / mirrored-networking setup in the
      README; note reliance on the bridge's existing SSE reconnect.
- [ ] D2 Real-machine: Windows-host renderer + WSL2 sidecar, open a `/home/...`
      project, get a WSL terminal, sessions persist + rebuild across restart.
- [ ] D3 `npm run lint` + `cargo check`; move this change to archived once
      verified (`add-project-sessions` is already archived).
