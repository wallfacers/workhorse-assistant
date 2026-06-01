# Proposal: WSL-managed sidecar (toggle → app launches & supervises the sidecar in WSL)

> **Status: DRAFTED.** Builds on the shipped `wsl-remote` capability (project
> paths / terminals in the sidecar namespace, host-OS-gated `wsl.exe`) and the
> `agent-auto-connect` health loop. This change adds **process lifecycle
> ownership**: the assistant can spawn and supervise the `workhorse-agent`
> sidecar *inside a chosen WSL distro*, so the user no longer hand-runs `serve`.

## Why

Today the WSL remote setup is correct but **manual**: the user opens a WSL shell,
runs `workhorse-agent serve`, optionally edits `%UserProfile%\.wslconfig`, then
fills the endpoint in Settings. The assistant only ever *attaches* to an
already-running sidecar at an endpoint (`AgentBridge`, default
`http://127.0.0.1:7821`); it owns no sidecar process.

The user wants a single toggle: turn it on, and on every launch the app itself
starts the sidecar in WSL and connects — "open app → chatting" with zero shell
steps. That requires three things the assistant lacks:

1. **A persisted toggle.** The app currently has **no on-disk config at all** —
   the endpoint lives only in memory (`BridgeInner.endpoint`) and resets to the
   default on restart. A managed-mode switch must survive restarts, so this
   change introduces the app's first persistence file.

2. **WSL detection + distro selection.** Settings must know the host is Windows
   with WSL installed and let the user pick which distro hosts the sidecar.

3. **A sidecar supervisor.** Spawn `wsl.exe -d <distro> -- <serve cmd>`, let the
   existing auto-connect loop converge the connection, restart on crash with
   backoff, and kill the spawned process on app exit — while never killing a
   sidecar the app did not start.

The architecture already shapes this well: `agent-auto-connect` *already* probes
`/health` with exponential backoff and handles "frontend starts before sidecar →
wait → connected". So the supervisor stays thin — it owns *spawn / restart /
teardown*, not the health-wait loop.

## What Changes

- **First on-disk config** (`app_config_dir/config.json`): `{ endpoint, wsl: {
  managed, distro, serveCmdOverride, port } }`. Loaded at startup into
  `AgentBridge` (closing the existing "endpoint resets on restart" gap) and the
  supervisor. Persisted via new IPC commands. Missing/corrupt file → safe
  defaults (managed off, endpoint `http://127.0.0.1:7821`).

- **WSL detection IPC** (`wsl_detect`): returns `{ hostIsWindows, available,
  distros: [...] }` by running `wsl -l -q` (only on a Windows host; off-Windows
  reports `available:false` and the toggle is hidden, consistent with the
  `wsl-remote` host-OS gate).

- **Sidecar supervisor** (new Rust module): a state machine
  (Disabled → Probing → {Adopted | Starting → Healthy → Restarting} | Failed).
  When managed mode is on and the host is Windows, at startup it reconciles the
  endpoint port; an already-healthy sidecar is **adopted** (reused, never reaped);
  otherwise it spawns `wsl.exe -d <distro> -- bash -lic 'exec workhorse-agent
  serve --host 127.0.0.1 --port <port>'` (or the override), hands the wait to
  auto-connect, restarts on crash with backoff (capped → Failed), and reaps only
  its own spawned process on app exit / toggle-off.

- **No process leak (hard requirement).** The supervisor guarantees at most one
  app-owned `workhorse-agent` in WSL at any time. It reaps by in-distro PID
  (graceful `SIGTERM` → `SIGKILL`, discovered by port + `cmdline` identity check),
  reconciles on every boot/restart so a hard-crash orphan is reclaimed on the next
  launch, uses `exec` to collapse the shell parent, and treats toggle-off as
  teardown. A process it cannot confirm is a `workhorse-agent` it started is never
  killed (honoring `feedback_never-kill-user-processes`).

- **Supervisor status surface**: a Rust event the renderer subscribes to so
  Settings shows a live badge (starting / healthy / adopted / restarting /
  failed) with the failure reason.

- **Settings → Agent**: WSL managed toggle, distro dropdown (from `wsl_detect`),
  an advanced "serve command" override field, and the status badge.

## Capabilities

### New Capabilities

- `wsl-managed-sidecar`: the assistant detects WSL, persists a managed-mode
  toggle + distro choice, and spawns/supervises the `workhorse-agent` sidecar
  inside the chosen distro — converging the connection via the existing
  auto-connect loop, restarting on crash, and tearing down on exit, while never
  killing a sidecar it did not start.

### Modified Capabilities

- `agent-auto-connect`: the health/probe loop now has an *upstream producer*
  (the supervisor) that ensures a sidecar is being launched into the configured
  endpoint. The probe/verify/backoff behavior is unchanged; this change only
  documents that managed mode is what makes the sidecar appear.

## Impact

- **Renderer**: `SettingsModal` gains the WSL block (toggle / distro dropdown /
  advanced command / status badge); a small hook subscribes to supervisor status
  events. New IPC wrappers in `src/ipc/`.
- **Rust (`src-tauri`)**: new `wsl` (or `supervisor`) module; new `config`
  module for the on-disk file; `AgentBridge` loads `endpoint` from config at
  startup and persists on `set_endpoint`; new commands (`wsl_detect`,
  `get/set_managed_config`, `supervisor_status`) registered in `lib.rs`; the
  `RunEvent::Exit` / `WindowEvent::Destroyed` teardown path also stops the
  supervisor (kills the spawned sidecar).
- **Backward compatibility**: managed mode defaults **off** → behavior identical
  to today (attach to a manually-run sidecar). No sidecar (Go) changes required;
  `/health`, `distro`, `default_workdir` already exist.

## Resolved questions (were open; settled by the no-leak analysis)

- **Restart cap / backoff** — 1s→30s, cap 5 → `Failed`; Gate-1 reconcile runs
  before every restart so a crash loop never stacks processes, and `Failed` reaps
  the last spawned process. (Cap value still tunable in review.)
- **`bash -lic` wrapper** — keep it for login PATH, but `exec` the binary so no
  shell parent survives to orphan `serve`. This is a leak-safety requirement, not
  a style choice.
- **Manual stop/restart control** — restart is automatic; an explicit restart
  button is optional in v1. `stop` semantics are already implied by toggle-off,
  which reaps a spawned sidecar.

## Remaining open questions

- The exact backoff cap (5 is a sketch).
- Whether to also terminate the Windows `wsl.exe` relay via a job object, or rely
  solely on in-distro PID reaping (design leans toward both).
