# Tasks — add-wsl-remote

> Status: PARKED. Do not start the assistant-side items (§B/§C) until the
> sidecar endpoints they depend on exist. Delivery order is in
> [`design.md`](./design.md); the batch-1 sidecar contract is the standalone
> [`../archive/2026-05-31-add-project-sessions/workhorse-agent-tasks.md`](../archive/2026-05-31-add-project-sessions/workhorse-agent-tasks.md).

## A. Sidecar (Go) — batch 2 (WSL enablement)

> Batch 1 (sessions / history / projects / rename / delete / tool_call_done
> output) is specified in `add-project-sessions/workhorse-agent-tasks.md` and
> must land first — it finishes `add-project-sessions` with no WSL involved.

- [ ] A1 `GET /health` returns `default_workdir` (the sidecar's default project
      path) so the renderer can cold-start with no host-cwd fallback (D-WSL-2).
- [ ] A2 `GET /health` `capabilities` expose `platform` (e.g. `linux`/`windows`)
      and, on WSL, `distro` — so the UI can default the terminal to `wsl` and
      know it is talking to a remote sidecar.
- [ ] A3 `GET /v1/fs/list?path=<dir>` enumerates directory entries in the
      sidecar namespace (for a namespace-correct project browser). Returns
      `{ entries: [{ name, path, isDir }] }`; `path` omitted → sidecar default.

## B. Assistant — connection & cold start (needs A1)

- [ ] B1 Drop the Rust `attach` host-cwd fallback (`std::env::current_dir()` in
      `src-tauri/src/agent/mod.rs`); require an explicit non-empty `workdir`
      (§1.7 / D-WSL-1).
- [ ] B2 Renderer cold-start precedence: remembered project → `/health
      default_workdir` → project picker (D-WSL-2). Extend `HealthInfo`
      (`src/ipc/agent.ts` + Rust struct) with `default_workdir`.
- [ ] B3 Full health/session decoupling (D-WSL-4): `useAgentConnection` → pure
      health probe (no `attachAgentSession`, no `sessionId`); `SessionProvider`
      owns bootstrap creation on `connected`; per-live-session
      `connection_failed` → `openAgentSession(id)` re-subscribe (not re-create).
      Update `SettingsModal` / `AgentRail` status text that read `agent.sessionId`.
- [ ] B4 Settings: editable agent endpoint + reconnect (needs a Rust
      endpoint-mutation command). Was `add-project-sessions` §4.6.

## C. Assistant — project picker & terminal (needs A2/A3)

- [ ] C1 Namespace-correct project browser backed by `GET /v1/fs/list`
      (replaces today's manual path entry; local recents stay as a fast path).
- [ ] C2 `wsl` terminal profile: spawn `wsl.exe -d <distro> --cd <wslpath>`
      (PTY stays host-side). Default the profile from `/health` platform/distro.
- [ ] C3 Project ↔ terminal coupling: switching to a WSL project makes new
      terminals WSL shells at that path (the coupling deferred by
      `add-project-sessions`, tech-debt D4).

## D. Docs / verification

- [ ] D1 Document WSL2 localhost-forwarding / mirrored-networking setup in the
      README; note reliance on the bridge's existing SSE reconnect.
- [ ] D2 Real-machine: Windows-host renderer + WSL2 sidecar, open a `/home/...`
      project, get a WSL terminal, sessions persist + rebuild across restart.
- [ ] D3 `npm run lint` + `cargo check`; move this change to archived once
      verified (`add-project-sessions` is already archived).
