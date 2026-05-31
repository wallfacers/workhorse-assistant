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
