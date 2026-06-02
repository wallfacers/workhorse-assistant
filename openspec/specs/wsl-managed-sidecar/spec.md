# wsl-managed-sidecar Specification

## Purpose
Defines how the assistant detects WSL, persists a managed-mode toggle plus distro
choice, and spawns/supervises the `workhorse-agent` sidecar inside the chosen WSL
distro — converging the connection via the existing auto-connect loop, restarting
on crash with bounded backoff, and tearing down on exit, while never killing a
sidecar it did not start. The overriding constraint is the no-leak invariant: at
most one app-owned `workhorse-agent` process exists in WSL at any time.
## Requirements
### Requirement: WSL detection gates the managed-mode toggle

The assistant SHALL expose a managed-sidecar toggle in Settings only when its own
host process runs on Windows AND at least one WSL distro is installed. Detection
SHALL run `wsl -l -q` on a Windows host and return the host-OS signal, an
availability flag, and the list of distro registration names. When the host is
not Windows, detection SHALL report `available: false` and the toggle SHALL be
hidden — consistent with the `wsl-remote` host-OS gate (inside WSL/Linux the
sidecar is already local, so there is nothing to manage).

#### Scenario: Windows host with WSL installed

- **WHEN** the assistant runs on Windows and `wsl -l -q` lists `Ubuntu` and `Debian`
- **THEN** detection returns `{ hostIsWindows: true, available: true, distros: ["Ubuntu", "Debian"] }`
- **AND** Settings shows the managed-sidecar toggle and a distro dropdown populated with those names

#### Scenario: Windows host with no WSL installed

- **WHEN** the assistant runs on Windows and `wsl -l -q` lists no distros (or `wsl` is absent)
- **THEN** detection returns `available: false`
- **AND** Settings does not show the managed-sidecar toggle

#### Scenario: Non-Windows host

- **WHEN** the assistant build runs on Linux (e.g. inside WSL) or macOS
- **THEN** detection returns `{ hostIsWindows: false, available: false }` without invoking `wsl.exe`
- **AND** the managed-sidecar toggle is hidden

### Requirement: Managed-mode configuration persists to disk

The assistant SHALL persist a `RuntimeMode` (`Native` default, or `Wsl{distro}`)
to a config file in the app config directory, replacing the previous
`managed: bool` toggle. The config SHALL also record the chosen distro (when
`Wsl`), an optional serve-command override, the port, and the sidecar endpoint
so they survive restarts. A missing, unreadable, or malformed config file SHALL
NOT block startup — the app falls back to safe defaults (`RuntimeMode::Native`,
endpoint `http://127.0.0.1:7821`). The endpoint resolution order at startup SHALL
be: `ENDPOINT_ENV` override, then the persisted config value, then the built-in
default. There is no migration from the legacy `managed` field (early stage,
no backward compatibility) — its absence resolves to `Native`.

#### Scenario: Runtime mode survives a restart

- **WHEN** the user selects `WSL` mode with distro `Ubuntu` in Settings
- **THEN** the config file records `{ runtime: { mode: { wsl: { distro: "Ubuntu" } }, ... } }`
- **AND** after restarting the app, `WSL` mode is still selected with `Ubuntu`

#### Scenario: Legacy or missing config resolves to Native

- **WHEN** the config file is missing the runtime mode field (or is malformed)
- **THEN** the app starts in `RuntimeMode::Native` with the default endpoint
- **AND** the fallback is logged, not surfaced as a blocking error

#### Scenario: Environment override wins over persisted endpoint

- **WHEN** the config persists `endpoint: "http://127.0.0.1:9000"` and `ENDPOINT_ENV` is set to `http://127.0.0.1:7821`
- **THEN** the bridge uses `http://127.0.0.1:7821`

### Requirement: Managed mode spawns the sidecar in the chosen distro

The assistant SHALL, when `RuntimeMode` is `Wsl{distro}` and the host is Windows,
launch the `workhorse-agent` sidecar at startup inside the configured distro
via `wsl.exe -d <distro> -- bash -lic 'exec workhorse-agent serve --host
127.0.0.1 --port <port>'` (the `exec` collapses the shell so the sidecar cannot be
orphaned). A serve-command override replaces the in-distro command verbatim, still
wrapped as `wsl.exe -d <distro> -- bash -lic 'exec <override>'`. The WSL spawn
path is now one of two runtime back-ends driven by the unified runtime selector;
it is no longer the only managed path. The assistant SHALL NOT poll for health
convergence itself — the existing auto-connect probe/backoff loop marks the
connection connected.

#### Scenario: WSL-mode launch on a clean start

- **WHEN** `RuntimeMode` is `Wsl{Ubuntu}`, no override is set, and no sidecar is listening on the port
- **THEN** the assistant spawns `wsl.exe -d Ubuntu -- bash -lic 'exec workhorse-agent serve --host 127.0.0.1 --port 7821'`
- **AND** the auto-connect loop converges the connection to `connected` once `/health` responds

#### Scenario: Native mode does not touch WSL

- **WHEN** `RuntimeMode` is `Native`
- **THEN** the assistant SHALL NOT invoke `wsl.exe` to spawn a sidecar
- **AND** the WSL supervisor back-end SHALL remain `Disabled`

### Requirement: A pre-existing healthy sidecar is adopted, not duplicated

Before spawning, the assistant SHALL probe the configured endpoint. If a
compatible sidecar is already healthy there, the assistant SHALL adopt it (use it
as-is) and SHALL NOT spawn a second process. An adopted sidecar SHALL NOT be
killed on app exit, because the app did not start it.

#### Scenario: Reuse a manually-started sidecar

- **WHEN** managed mode is on and a healthy sidecar is already listening on the endpoint (e.g. the user ran `serve` by hand)
- **THEN** the assistant adopts it and does not spawn another sidecar
- **AND** on app exit the adopted sidecar is left running

#### Scenario: Spawn only when the port is free

- **WHEN** managed mode is on and no sidecar responds on the endpoint
- **THEN** the assistant spawns the sidecar in the chosen distro

### Requirement: Crash restart with bounded backoff

When a sidecar the assistant spawned exits unexpectedly, the assistant SHALL
restart it with exponential backoff, running the startup port reconcile before
each restart so a hung remnant is reclaimed rather than stacked. After a bounded
number of consecutive failures the assistant SHALL stop retrying and enter a
`Failed` state with a surfaced reason, rather than looping indefinitely. The
`Failed` terminal state SHALL NOT leave a leaked process behind — the last
spawned process is reaped before entering `Failed`.

#### Scenario: Transient crash is recovered

- **WHEN** the spawned sidecar exits once and the failure count is under the cap
- **THEN** the assistant reconciles the port, restarts the sidecar after a backoff delay
- **AND** a successful restart that turns `/health` green resets the failure count

#### Scenario: Repeated crashes give up without leaking

- **WHEN** the spawned sidecar exits repeatedly and the failure count reaches the cap
- **THEN** the assistant reaps any surviving spawned process and enters `Failed` with the last exit reason
- **AND** no `workhorse-agent` process the assistant spawned remains running

### Requirement: Spawned sidecar is reaped by in-distro PID on app exit

The assistant SHALL reap a sidecar it spawned when the app exits or its window is
destroyed, using the same teardown path as the PTY registry and agent bridge.
Reaping SHALL target the in-distro process (graceful `SIGTERM`, then `SIGKILL`
after a bounded wait), identified by the port owner's PID with a
`/proc/<pid>/cmdline` identity check — not by killing the `wsl.exe` relay, which
does not reliably reap the Linux process. The assistant SHALL NOT reap an adopted
sidecar.

#### Scenario: Spawned sidecar dies with the app

- **WHEN** managed mode spawned the sidecar and the app exits
- **THEN** the assistant sends `SIGTERM` to the in-distro sidecar PID, waits the graceful window, then `SIGKILL` if still alive

#### Scenario: Adopted sidecar outlives the app

- **WHEN** managed mode adopted an externally-started sidecar and the app exits
- **THEN** the assistant leaves that sidecar running

### Requirement: Startup reconcile reclaims an orphaned sidecar (no process leak)

The assistant SHALL reconcile the configured port before spawning, to bound
orphaned in-distro processes to at most one. A healthy compatible sidecar is
adopted (see adoption requirement). A port held by a process the assistant
confirms (by `/proc/<pid>/cmdline`) is a `workhorse-agent` but which is not
healthy SHALL be treated as a reclaimable remnant and reaped (`SIGTERM` then
`SIGKILL`) before spawning a fresh one. A port held by any process the assistant
cannot confirm is a `workhorse-agent` SHALL NOT be killed; the assistant surfaces
a "port busy" error instead (honoring never-kill-user-processes). This reconcile
SHALL also run before each crash-restart.

#### Scenario: A leaked sidecar from a prior hard crash is reclaimed on next launch

- **WHEN** a previous app run exited without teardown and left a `workhorse-agent` holding the port in a non-healthy state
- **THEN** on the next launch the assistant confirms its identity by cmdline, reaps it, and spawns a fresh sidecar
- **AND** no second concurrent sidecar is created

#### Scenario: A foreign process on the port is never killed

- **WHEN** the configured port is held by a process whose `cmdline` is not `workhorse-agent`
- **THEN** the assistant does not kill it and surfaces a "port busy" error naming the occupant
- **AND** managed-mode startup enters `Failed` with that reason

### Requirement: Disabling managed mode reaps the spawned sidecar

Turning managed mode off SHALL gracefully reap a sidecar the assistant spawned
(it SHALL NOT leave it running), so toggling off cannot leak a process. An adopted
sidecar is left running. The off state SHALL persist to config.

#### Scenario: Toggle off reaps a spawned sidecar

- **WHEN** managed mode spawned the sidecar and the user turns the toggle off
- **THEN** the assistant reaps the spawned sidecar (graceful `SIGTERM` then `SIGKILL`)
- **AND** the config records `wsl.managed = false`

#### Scenario: Toggle off leaves an adopted sidecar running

- **WHEN** managed mode adopted an externally-started sidecar and the user turns the toggle off
- **THEN** the assistant leaves that sidecar running

### Requirement: Managed-sidecar status is surfaced to the UI

The assistant SHALL emit supervisor state transitions to the renderer so Settings
can display a live status (e.g. starting, healthy, adopted, restarting, failed)
with the reason on failure. The status reflects the supervisor state machine, not
the auto-connect health dot (which continues to reflect reachability).

#### Scenario: Settings reflects the supervisor lifecycle

- **WHEN** managed mode spawns the sidecar
- **THEN** Settings shows `starting`, then `healthy` once the connection converges
- **WHEN** the sidecar later crashes and is being restarted
- **THEN** Settings shows `restarting`, and `failed` with a reason if the cap is reached

