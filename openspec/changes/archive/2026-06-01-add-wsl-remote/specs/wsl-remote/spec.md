> Draft requirement for a PARKED change. Refine when scheduled.

## ADDED Requirements

### Requirement: Project paths and terminals in the sidecar namespace

When the sidecar runs remotely (WSL2), the assistant SHALL select project paths
within the sidecar's filesystem namespace (not the Windows host dialog) and SHALL
open embedded terminals as shells in that same namespace at the project path. The
renderer and bridge SHALL NOT assume `workdir` is a host-Windows path.

#### Scenario: Open a WSL project and get a WSL terminal

- **WHEN** the sidecar runs in WSL2 and the user opens a project path `/home/user/proj`
- **THEN** the project is created with `workdir = /home/user/proj` (verbatim, no
  host-path translation)
- **AND** a new terminal in that project is a shell rooted at `/home/user/proj`
  inside WSL (e.g. launched via `wsl.exe --cd /home/user/proj`)

### Requirement: Explicit workdir with a sidecar-provided cold-start default

The assistant SHALL always send an explicit `workdir` when creating a session;
the Rust bridge SHALL NOT fall back to the host process cwd. On first launch
with no remembered project, the assistant SHALL use the sidecar's reported
default workdir (`default_workdir` from `GET /health`) as the initial project,
and SHALL fall back to a project-picker prompt only when none is available.

#### Scenario: Cold start uses the sidecar's default workdir

- **WHEN** the app launches with no remembered project and `GET /health` returns
  `default_workdir = /home/user`
- **THEN** the assistant opens `/home/user` as the current project and creates the
  bootstrap session with `workdir = /home/user` (no host-cwd fallback)

#### Scenario: Cold start with no default falls back to the picker

- **WHEN** the app launches with no remembered project and `/health` reports no
  `default_workdir`
- **THEN** the assistant shows the project picker and creates no session until the
  user chooses a path

### Requirement: WSL terminal bridge only on a Windows host

The `wsl` terminal profile (`wsl.exe -d <distro> --cd <path>`) SHALL be launched
only when the assistant's **host process runs on Windows**. When the host is not
Windows — including when the assistant build itself runs inside WSL/Linux — the
assistant SHALL NOT spawn `wsl.exe`, even if `GET /health` reports a `distro`; it
SHALL launch a local shell rooted at the project `workdir` instead. The
host-Windows gate SHALL exist in the Rust PTY layer (the authoritative,
compile-time host-OS check) AND the renderer's `terminal`→`wsl` auto-promotion
SHALL respect the same host-OS signal.

> Rationale: `health.platform` is the **sidecar's** `runtime.GOOS`, not the
> host's. The only correct signal for "can/should we run `wsl.exe`" is the OS the
> assistant itself runs on. Inside WSL, `wsl.exe` is reachable via interop, so an
> ungated launch does not fail fast with "command not found" — it reaches
> `wsl.exe -d <distro>` and fails late with `WSL_E_DISTRO_NOT_FOUND`.

#### Scenario: Assistant runs inside WSL/Linux (same-host sidecar)

- **WHEN** the assistant build runs on Linux (e.g. inside WSL) and `GET /health`
  reports a `distro`
- **THEN** a new `terminal` pane launches a local shell (`$SHELL`/`bash`), not
  `wsl.exe`
- **AND** the shell is rooted at the project `workdir` (a same-host WSL path is
  host-valid, so the local profile's cwd is correct)

#### Scenario: Windows host bridges into a WSL sidecar

- **WHEN** the assistant build runs on Windows and `/health` reports a `distro`
- **THEN** a new `terminal` pane launches `wsl.exe -d <distro> --cd <workdir>`

### Requirement: WSL distro identifier is the registration name

The `distro` reported on `GET /health` and consumed by `wsl.exe -d` SHALL be the
WSL **registration name** (as listed by `wsl -l`), not the distribution's
`/etc/os-release` `PRETTY_NAME`. The sidecar SHALL source it from
`$WSL_DISTRO_NAME` (set by WSL inside every distro), falling back to `PRETTY_NAME`
only when that variable is unset.

#### Scenario: distro feeds `wsl.exe -d` correctly

- **WHEN** the sidecar runs in a WSL distro registered as `Ubuntu` whose
  `PRETTY_NAME` is `"Ubuntu 24.04.3 LTS"`
- **THEN** `GET /health` reports `distro = "Ubuntu"`
- **AND** `wsl.exe -d Ubuntu` resolves the distro (no `WSL_E_DISTRO_NOT_FOUND`)
