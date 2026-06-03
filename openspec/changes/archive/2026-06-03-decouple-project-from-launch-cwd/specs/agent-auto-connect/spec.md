## ADDED Requirements

### Requirement: Sidecar default workdir resolves to a stable user directory

The sidecar's `GET /health.default_workdir` SHALL resolve to the
`server.default_workdir` configuration override when it is set, otherwise to the
user's home directory (`os.UserHomeDir()`). It SHALL NOT fall back to the sidecar
process's launch directory (`os.Getwd()`), which is an accident of how the
long-running sidecar was started and is never a meaningful project. When neither
an override nor a home directory is available, the sidecar SHALL omit
`default_workdir` (or return it empty) so the assistant routes to the project
picker, rather than reporting the launch directory.

#### Scenario: No config override falls back to home

- **WHEN** the sidecar has no `server.default_workdir` configured
- **THEN** `GET /health` returns `default_workdir` equal to the user's home directory
- **AND** the value is NOT the directory the sidecar process was launched from

#### Scenario: Config override takes precedence

- **WHEN** `server.default_workdir` is set to `P`
- **THEN** `GET /health` returns `default_workdir = P`

#### Scenario: No override and no resolvable home

- **WHEN** the sidecar has no override and cannot resolve a home directory
- **THEN** `GET /health` omits `default_workdir` (or returns it empty)
- **AND** does NOT report the sidecar's launch directory
