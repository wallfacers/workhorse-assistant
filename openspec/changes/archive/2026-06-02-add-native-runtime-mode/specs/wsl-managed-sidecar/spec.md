## MODIFIED Requirements

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
