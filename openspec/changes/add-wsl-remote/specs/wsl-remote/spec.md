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
