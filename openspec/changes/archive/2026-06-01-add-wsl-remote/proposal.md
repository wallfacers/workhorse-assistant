> **Status: PARKED, detailed.** Captured during `add-project-sessions` and
> fleshed out 2026-06-01 with the items that change punted here (§1.7 explicit
> workdir, full health/session decoupling) plus the sidecar endpoints that gate
> everything downstream. Not yet scheduled. See [`design.md`](./design.md) for
> the delivery-order dependency graph and [`tasks.md`](./tasks.md) for the split
> between the Go sidecar and the assistant.

## Why

The user develops in WSL and runs a **Windows-native** build of
workhorse-assistant (`project_windows-build-from-wsl`). The natural setup mirrors
**VS Code Remote-WSL**: UI on Windows, the `workhorse-agent` sidecar inside WSL2,
and the opened **project is a WSL path** (`/home/user/proj`). WSL gives better dev
toolchain compatibility, so projects should live there.

The architecture is already shaped for this: the renderer never touches the
network/filesystem; everything privileged crosses the Rust bridge's loopback HTTP
boundary to the sidecar — i.e. the sidecar **is** the "server" in a client/server
remote model. The agent transport, session model, persistence, and UI-control
surface are transport-agnostic and effectively remote-ready. Two subsystems are
**not**: the embedded terminal (PTY runs on the Windows host) and project-path
selection (Windows folder dialog ≠ WSL namespace).

## What Changes (sketch — to be detailed)

- **Project path in the sidecar namespace.** Project selection works in the
  sidecar's filesystem, not the Windows dialog. Preferred: the sidecar enumerates
  paths (`GET /v1/fs/list?path=` or recent projects), so the picker is
  namespace-correct by construction. Windows folder dialog becomes the fallback
  for a local-Windows sidecar only. (Avoid `\\wsl$\` ↔ `/…` translation if
  possible; if needed, it lives on the assistant side, never in the sidecar.)
- **Terminal lands in WSL.** Add a `wsl` terminal profile that spawns
  `wsl.exe -d <distro> --cd <wslpath>` — the PTY stays on the Windows host, the
  shell process is the WSL bridge (80% solution; no server-side PTY).
- **Endpoint + platform awareness.** Agent endpoint configurable in Settings
  (forward-compat from `add-project-sessions`); `/health` capabilities expose
  platform/distro so the UI defaults the terminal to the `wsl` profile and knows
  it is talking to a remote sidecar.
- **Explicit `workdir` + cold-start default (absorbs §3.6's deferred §1.7).**
  Drop the Rust `attach` host-cwd fallback (`std::env::current_dir()`): with a
  remote sidecar the host cwd is the *wrong namespace*. The renderer must always
  pass an explicit `workdir`. To keep the zero-config "open app → start chatting"
  flow, the sidecar reports its default workdir on `GET /health`
  (`default_workdir`); the renderer uses it as the initial `currentProject` on
  first launch (then remembers the last project). Without it, first launch shows
  the project picker. This is why §1.7 belongs *here*, not in
  `add-project-sessions`: it needs `/health default_workdir`, which lands with
  the WSL capabilities.
- **Networking guidance.** Document WSL2 localhost forwarding / mirrored
  networking mode; rely on the bridge's existing SSE reconnect for transient
  forward drops.
- **Project ↔ terminal coupling.** Switching to a WSL project makes new terminals
  WSL shells at that path (the coupling deferred by `add-project-sessions`).

## Capabilities

### New Capabilities
- `wsl-remote` (placeholder): run the sidecar remotely (WSL2) with project paths
  and terminals in the sidecar's namespace.

## Impact (sketch)

- **Renderer**: namespace-aware project picker; `wsl` terminal profile wiring;
  Settings endpoint + platform-driven defaults.
- **Tauri**: `wsl.exe` launch profile; optional `\\wsl$\` translation helper.
- **workhorse-agent**: `GET /v1/fs/list` (or recent projects); platform/distro in
  `/health` capabilities.
- **Out of scope**: server-side PTY; multiple simultaneous distros/remotes;
  non-WSL remotes (SSH containers, etc.).

## Open questions

- Path translation vs. fully sidecar-served enumeration — pick one.
- One sidecar/distro at a time, or a remote switcher alongside the project
  switcher?
- Does the assistant ever need to render a host-Windows path, or is everything in
  the sidecar namespace once a remote project is open?
