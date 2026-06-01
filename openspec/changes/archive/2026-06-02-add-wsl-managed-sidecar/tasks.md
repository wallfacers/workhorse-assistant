# Tasks — add-wsl-managed-sidecar

> Approach A (see [`design.md`](./design.md)). No sidecar (Go) changes required —
> `/health`, `distro`, and `default_workdir` already ship. All work is in
> `workhorse-assistant` (Rust bridge + renderer). Managed mode defaults **off**,
> so each group is independently shippable without regressing today's behavior.

## A. On-disk config (the app's first persistence)

- [x] A1 New `config` module (`src-tauri/src/config/`): load/save
      `app_config_dir/config.json` with schema `{ endpoint, wsl: { managed,
      distro, serveCmdOverride, port } }`. Atomic write (temp + rename).
- [x] A2 Missing/unreadable/malformed file → in-memory defaults (managed off,
      endpoint `http://127.0.0.1:7821`); log-and-ignore, never block startup.
- [x] A3 `AgentBridge` loads `endpoint` from config at startup; resolution order
      `ENDPOINT_ENV` → config → built-in default. `set_endpoint` persists.
- [x] A4 Unit tests: round-trip, corrupt-file fallback, env-override precedence.

## B. WSL detection

- [x] B1 `wsl_detect` command: on Windows run `wsl -l -q`, parse the distro list
      (handle UTF-16LE / NUL output), return `{ hostIsWindows, available, distros }`.
- [x] B2 Off-Windows short-circuits to `{ hostIsWindows: false, available: false }`
      without invoking `wsl.exe`.
- [x] B3 `src/ipc/` wrapper + types for `wsl_detect`.
- [x] B4 Unit tests for the distro-list parser (UTF-16LE, empty, single, multi).

## C. Supervisor module

- [x] C1 New `src-tauri/src/wsl/` (supervisor) module with the state machine
      (Disabled / Probing / Adopted / Starting / Healthy / Restarting / Failed).
- [x] C2 Startup reconcile (Gate 1): host gate → managed flag → probe endpoint →
      adopt healthy | reap-if-ours (cmdline identity check) | error-if-foreign |
      spawn if free.
- [x] C3 Build the launch invocation with mandatory `exec`: `wsl.exe -d <distro>
      -- bash -lic 'exec workhorse-agent serve --host 127.0.0.1 --port <port>'`,
      or `exec <override>` verbatim.
- [x] C4 Adopt path: a pre-existing healthy sidecar is reused and flagged
      "not ours" (never reaped on exit / toggle-off).
- [x] C5 Crash detection (watch the `wsl.exe` relay handle exit) + exponential-
      backoff restart (1s→30s); **run Gate 1 reconcile before each restart**;
      failure-count cap → `Failed` (after reaping the last spawned process) with
      reason; reset count on a healthy restart.
- [x] C6 Reap-by-PID (Gate 2): discover the port owner's in-distro PID
      (`ss -ltnpH`/`fuser`), verify `/proc/<pid>/cmdline` is `workhorse-agent`,
      then `SIGTERM` → bounded wait → `SIGKILL`. Never reap via the relay; also
      terminate the Windows `wsl.exe` relay handle (job object).
- [x] C7 Teardown (Gate 3): hook `RunEvent::Exit` / `WindowEvent::Destroyed` to
      reap only a spawned sidecar (leave adopted), reusing the bounded
      `SHUTDOWN_DRAIN_BUDGET` wait.
- [x] C8 Toggle-off reaps a spawned sidecar gracefully (leaves adopted); persists
      `wsl.managed = false`.
- [x] C9 Emit `supervisor://status` events on every state transition.
- [x] C10 `get_managed_config` / `set_managed_config` / `supervisor_status`
      commands registered in `lib.rs`.
- [x] C11 Unit tests: state-machine transitions; adopt-vs-reap-vs-foreign-vs-spawn
      reconcile decision; cmdline identity gate (never kill foreign); backoff cap;
      `Failed` leaves no spawned process; "reap spawned but not adopted".

## D. Settings UI

- [x] D1 `SettingsModal` Agent tab: WSL managed toggle (hidden unless
      `wsl_detect.available`), distro dropdown, advanced serve-command field.
- [x] D2 Live status badge bound to `supervisor://status`
      (starting / healthy / adopted / restarting / failed + reason).
- [x] D3 Saving the toggle/distro persists config and (re)drives the supervisor
      without an app restart where feasible; document any restart-required cases.
- [x] D4 i18n strings for the new controls and statuses.

## E. Verification

- [x] E1 `npm run lint` clean; `cargo test` green.
- [ ] E2 Manual: Windows host, managed on, clean start → sidecar spawns, connects.
- [ ] E3 Manual: pre-running sidecar → adopted (not duplicated, survives app exit).
- [ ] E4 Manual: kill the sidecar process → supervisor restarts it; exhaust the cap
      → `Failed` with a clear reason and **no surviving spawned process**.
- [ ] E5 Manual: managed off → behavior identical to today (attach to manual sidecar).
- [ ] E6 No-leak: after force-quitting the app (no graceful exit), confirm next
      launch reconciles and reclaims the orphan — exactly one `workhorse-agent`
      runs in-distro (`wsl -d <d> -- pgrep -a workhorse-agent`). Repeat a few
      crash/restart cycles and confirm the count never exceeds 1.
- [ ] E7 No-leak: a foreign process holding the port is NOT killed; startup
      surfaces a "port busy" `Failed` reason.
