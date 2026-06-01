# Design — add-wsl-managed-sidecar

> Companion to [`proposal.md`](./proposal.md). Approach **A** from the
> brainstorming session: a dedicated Rust supervisor module + the app's first
> on-disk config, wired into the existing `AgentBridge` connection and the
> `agent-auto-connect` health loop. Rejected alternatives are recorded at the end.

## Where this sits in the existing system

```
┌──────────────────────── Windows host (Tauri app) ─────────────────────────┐
│  Renderer (TS)                          Rust (src-tauri)                    │
│  ┌────────────────────┐   IPC          ┌─────────────────────────────┐     │
│  │ SettingsModal       │──get/set──────▶│ config (NEW)                │     │
│  │  · WSL toggle        │◀──wsl_detect───│  app_config_dir/config.json │     │
│  │  · distro dropdown   │                │  (app's first disk persist) │     │
│  │  · advanced cmd      │                └──────────────┬──────────────┘     │
│  │  · status badge ◀────┼──event─────┐                  │ reads              │
│  └────────────────────┘             │                  ▼                    │
│  ┌────────────────────┐             │   ┌─────────────────────────────┐     │
│  │ useAutoConnect      │             └───│ wsl::Supervisor (NEW)       │     │
│  │ (EXISTING:           │                │  spawn wsl.exe -d <d> -- cmd │     │
│  │  probe/verify/backoff)│               │  detect crash → restart → kill│    │
│  └─────────┬──────────┘                └──────────────┬──────────────┘     │
│            │ agent_health_check / attach              │ wsl.exe             │
│            ▼                                          ▼                     │
│  ┌────────────────────┐                   loopback HTTP/SSE → port 7821     │
│  │ AgentBridge (EXISTING)│  endpoint now loaded from config at startup       │
│  └────────────────────┘                                                     │
└─────────────────────────────────────────────────────────────────────────────┘
                                                          │
                          ┌──────────── WSL2 distro ──────▼───────┐
                          │  workhorse-agent serve  (127.0.0.1)    │
                          └────────────────────────────────────────┘
```

**Key insight — the supervisor is thin.** `agent-auto-connect` already owns the
probe → verify → exponential-backoff loop and the "frontend starts before the
sidecar" scenario. So the supervisor does **not** poll for health convergence; it
only guarantees a sidecar *is being launched into the configured endpoint*. The
division of labor:

| Concern                         | Owner                          |
|---------------------------------|--------------------------------|
| Spawn `wsl.exe ... serve`       | Supervisor (new)               |
| Wait until `/health` is green   | `useAutoConnect` (existing)    |
| Verify protocol_version         | `useAutoConnect` (existing)    |
| Detect process crash / exit     | Supervisor (new)               |
| Restart with backoff            | Supervisor (new)               |
| Kill spawned sidecar on app exit| Supervisor (new) via RunEvent  |
| Reuse a manually-run sidecar    | Supervisor (new) — Adopt state |

## Supervisor state machine

```
            managed=off / host≠Windows     ┌─────────────┐
   ┌──────────────────────────────────────▶│  Disabled    │  (= today: pure attach)
   │                                        └─────┬───────┘
   │                              toggle on /      │
   │                              app start         ▼
   │                                        ┌─────────────┐  endpoint already healthy
   │                                        │  Probing     │──────────────────────┐
   │                                        └─────┬───────┘                       ▼
   │                              port free        │                    ┌──────────────────┐
   │                                               ▼                    │ Adopted          │
   │                                        ┌─────────────┐             │ reuse; do NOT    │
   │           spawn err / crash count       │  Starting    │             │ kill on exit     │
   │           > cap                         │  spawn wsl   │             └──────────────────┘
   │   ┌──────────────────┐                  └─────┬───────┘
   │   │  Failed           │◀──── backoff ─────────┤ child exits before healthy
   │   │ (reason surfaced, │      exhausted         │ auto-connect reports healthy
   │   │  manual fallback) │                        ▼
   │   └──────────────────┘                  ┌─────────────┐  child process exits
   │                                         │  Healthy     │──────────────────┐
   │                                         │ (we spawned) │                  ▼
   │                                         └─────────────┘         ┌──────────────────┐
   │                                                                 │ Restarting       │
   └──────────────────────────────── app exit → kill spawned ─────── │ backoff; count++  │
                                                                     └──────────────────┘
```

State transitions are reported to the renderer as `supervisor://status` events so
Settings can render a live badge. `Adopted` and `Healthy` both read as "connected"
to the user; the distinction only governs teardown (kill spawned, leave adopted).

## Startup decision flow

```
app start
  │
  ├─ host_is_windows?  ──no──▶ Disabled (Linux/WSL self-run, unchanged)
  │        │ yes
  ├─ config.wsl.managed?  ──false──▶ Disabled (attach to endpoint, = today)
  │        │ true
  ├─ probe endpoint /health healthy?  ──yes──▶ Adopted (reuse; exit won't kill)
  │        │ no
  └─ spawn wsl.exe -d <distro> -- <serveCmd>
           └─ hand off to useAutoConnect backoff → Healthy when /health turns green
```

Probing the endpoint **before** spawning is what prevents a double-bind: if the
user already ran `serve` by hand (or a previous app instance left one), we adopt
it rather than spawning a second process that fails to bind the port.

## On-disk config (the app's first persistence)

Location: Tauri core `app.path().app_config_dir()` (no plugin needed) →
`config.json`. Written atomically (temp + rename). Schema:

```jsonc
{
  "endpoint": "http://127.0.0.1:7821",   // also closes the "endpoint resets on restart" gap
  "wsl": {
    "managed": false,                     // the toggle
    "distro": "Ubuntu",                   // from the Settings dropdown (wsl -l -q)
    "serveCmdOverride": null,             // advanced field; null = convention default
    "port": 7821
  }
}
```

- **Missing / unreadable / malformed** → in-memory defaults (managed off, endpoint
  default). Never block startup on config IO; a corrupt file is logged and ignored,
  not surfaced as an error.
- `AgentBridge::default` currently seeds `endpoint` from `ENDPOINT_ENV` → default.
  New order: **env var → config file → built-in default**, so an explicit
  `ENDPOINT_ENV` still wins (dev override), then the persisted value, then the
  constant.

## The launch invocation (convention-first, `exec` to avoid an orphan parent)

Default command (no override set):

```
wsl.exe -d <distro> -- bash -lic 'exec workhorse-agent serve --host 127.0.0.1 --port <port>'
```

- `bash -lic` is a **login interactive** shell so the user's PATH (where
  `workhorse-agent` lives) is populated — a non-login `wsl.exe -d <d> -- workhorse-agent`
  often misses PATH entries from `.bashrc`/`.profile`. (`serve` accepts
  `--host`/`--port`, verified in `internal/config/load.go`.)
- **`exec` is mandatory, not stylistic.** Without it, `bash` stays as the parent
  of `serve`; when the `wsl.exe` relay dies or we signal the shell, `serve` can be
  re-parented to the distro's `init` and **leak**. `exec` replaces the bash image
  with `serve`, collapsing to a single relay-attached Linux process that takes a
  precise SIGTERM. See "No-leak invariant" below.
- `--host 127.0.0.1` keeps the bind loopback-only inside the distro (matches the
  sidecar's default network posture).
- **Override** (`serveCmdOverride`): when set, it replaces everything after
  `exec ` verbatim (the user owns the full command, e.g.
  `/home/u/bin/workhorse-agent serve --port 7821`); the app still wraps it as
  `wsl.exe -d <distro> -- bash -lic 'exec <override>'`.
- **Binary missing** → the spawned shell exits non-zero quickly; the supervisor's
  backoff sees repeated fast failures and lands in `Failed` with a reason that
  names the binary and points at the advanced field / install docs.

## No-leak invariant (no orphaned in-distro sidecars)

The hard requirement: the app must never accumulate orphaned `workhorse-agent`
processes inside the WSL VM (which would silently consume RAM). "Memory leak"
here means **leaked processes**, not heap. Two facts shape the solution:

- **WSL2 process model.** `wsl.exe` is only a *Windows-side relay client*; the
  Linux `workhorse-agent` runs in the distro's VM under that distro's `init`, not
  as a child of `wsl.exe` in the Windows process tree. Killing `wsl.exe` only
  sends the Linux side a SIGHUP at best — `serve` handles SIGTERM/SIGINT but **not
  SIGHUP** (`cmd/workhorse-agent/cmd_serve.go`), so relay death is an unreliable
  reaper. **Reaping must target the in-distro PID, not the relay.**
- **`feedback_never-kill-user-processes`.** We may only ever terminate a process
  we have confirmed (by identity) is a `workhorse-agent` *we* started. A foreign
  process holding the port is reported, never killed.

### The natural mutex: a fixed loopback port

`serve` binds `127.0.0.1:<port>`. A second `serve` cannot bind and exits fast, so
there can never be *N* listening sidecars. Steady state is bounded to **≤1
listener + at most one hung remnant** — turning an "unbounded growth" problem into
"reclaim that one remnant".

### Three gates that bound orphans to ≤1 and always reclaim

```
Gate 1 — Reconcile on boot (survives a hard app crash):
  before any spawn, probe the endpoint/port —
    healthy workhorse-agent      → ADOPT (reuse; never killed on exit)
    port busy, cmdline is ours   → our remnant → reap (SIGTERM→SIGKILL), then spawn
    port busy, foreign process   → DO NOT kill; surface "port busy by X"
    port free                    → spawn fresh

Gate 2 — Reap by in-distro PID (never via the relay):
    wsl.exe -d <d> -- kill -TERM <pid>     # serve drains gracefully
    (wait serve's GracefulShutdownTimeout)
    wsl.exe -d <d> -- kill -KILL <pid>     # hard backstop
  PID discovery (no pidfile exists): by port —
    wsl -d <d> -- bash -lc 'ss -ltnpH "sport = :<port>"'  (or fuser)
    then verify /proc/<pid>/cmdline contains "workhorse-agent"
  By-port discovery reconciles across app restarts and carries the identity check.

Gate 3 — Teardown on normal exit:
  RunEvent::Exit / WindowEvent::Destroyed already call kill_all()+bridge.shutdown()
  (lib.rs). The supervisor hooks the same path and reaps ONLY a spawned sidecar
  (adopted ones are left running), reusing the bounded SHUTDOWN_DRAIN_BUDGET wait.
```

Gate 1 is what makes leaks self-healing: even if a prior run crashed without
teardown, the *next* launch reclaims the remnant before spawning. Therefore at
most **one** orphan can exist between a crash and the next launch — never more.

### The invariant, stated once

> At any moment, the number of app-owned `workhorse-agent` processes in WSL is
> **≤ 1**. Every remnant is reclaimed by the next boot's reconcile or this exit's
> teardown. Only a process confirmed (by `cmdline`) to be a `workhorse-agent` we
> spawned is ever killed — foreign/user processes are never touched.

## Decisions (defaults; revisit in review)

| Decision                    | Default                                          | Rationale |
|-----------------------------|--------------------------------------------------|-----------|
| Pre-existing healthy sidecar| **Adopt & reuse; do not kill on exit**           | Don't steal/kill a process the app didn't start |
| Crash handling              | **Backoff restart, cap 5 → Failed; reconcile (Gate 1) before every restart** | Avoid crash-loop spam; reconcile prevents stacking a new process on a hung remnant |
| Failed terminal state       | **Must have reaped the last spawned process**     | `Failed` may not leave a leaked process behind |
| Backoff curve               | 1s → 30s (reuse auto-connect's curve shape)      | Consistency with the existing probe loop |
| serve command               | `bash -lic 'exec workhorse-agent serve ...'`      | Login shell for PATH; `exec` collapses the bash parent so `serve` can't be orphaned |
| Reap mechanism              | **By in-distro PID (SIGTERM→SIGKILL), discovered by port + cmdline identity check** | Killing the `wsl.exe` relay does not reliably reap the Linux process |
| Host not Windows            | Supervisor inert (Disabled)                      | Matches `wsl-remote` host-OS gate; inside WSL the sidecar is local |
| Distro selection            | Explicit dropdown (from `wsl -l -q`), persisted  | Multi-distro hosts must be unambiguous |
| Toggle OFF                  | **Gracefully reaps a spawned sidecar** (≠ leave running) | "off ⇒ teardown" is a no-leak requirement, not just a UI state |
| Manual stop/restart control | Restart is automatic; explicit restart button optional in v1 | `stop` semantics are already implied by toggle-off |
| Teardown                    | Reap **spawned** sidecar on `RunEvent::Exit`/Destroyed; leave adopted | Reuse the existing PTY/bridge teardown hook |

## Why not the alternatives

- **B — reuse PTY `SessionRegistry` to run the sidecar as a managed child.** The
  PTY registry is built for *terminal sessions* (cols/rows, reader thread
  forwarding bytes to the UI). A headless long-lived service has none of that;
  health-poll/restart logic would still be net-new. Saves one module, pollutes
  the PTY's single responsibility. Rejected.
- **C — launch from the renderer via a shell plugin.** Violates the repo rule
  ("privileged work routes through Rust commands; the renderer never touches
  network/process"). Rejected outright.

## Risks / unknowns

- **`wsl.exe` process tree on kill — resolved by design, validate in impl.** The
  No-leak invariant section handles this: we reap by in-distro PID (SIGTERM→SIGKILL,
  discovered by port + cmdline identity check), not by killing the relay, and we
  reconcile on every boot/restart. Implementation must still *verify* the by-port
  PID discovery (`ss`/`fuser`) and `/proc/<pid>/cmdline` identity check behave as
  expected across distros, and confirm the `exec` form leaves exactly one
  relay-attached process. The Windows-side `wsl.exe` relay handle should also be
  terminated (job object) so the relay client itself does not linger.
- **localhost forwarding flakiness.** Out of scope here — the bridge's existing
  SSE reconnect + auto-connect backoff already cover transient forward drops
  (documented in `wsl-remote`).
- **`wsl -l -q` output encoding.** WSL has historically emitted UTF-16LE with NULs
  from `wsl -l`; the detection parser must handle that (decode + strip), or the
  distro list comes back garbled. Flagged as a concrete implementation hazard.
