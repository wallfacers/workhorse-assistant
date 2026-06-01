## ADDED Requirements

### Requirement: Sidecar launch is the supervisor's job, not auto-connect's

The auto-connect health loop SHALL NOT launch, spawn, or restart any sidecar
process. Its sole responsibility remains probing `GET /health`, verifying
`protocol_version`, and managing reachability state with backoff. When managed
mode is on, the `wsl-managed-sidecar` supervisor is the upstream producer that
ensures a sidecar is being launched into the configured endpoint; auto-connect
then converges the connection exactly as it does for a manually-started sidecar.
The two surfaces stay independent: the auto-connect status dot reflects
*reachability*, while the supervisor status reflects *process lifecycle*.

#### Scenario: Managed launch reuses the existing backoff loop

- **WHEN** managed mode spawns the sidecar and the port is not yet listening
- **THEN** auto-connect's "frontend starts before sidecar" path applies unchanged: probe fails with `transient`, retries with backoff, and marks `connected` once `/health` turns green
- **AND** auto-connect itself does not spawn or restart any process

#### Scenario: Reachability dot and supervisor status are distinct

- **WHEN** managed mode reports `restarting` after a crash
- **THEN** the auto-connect status dot independently reflects reachability (e.g. "connecting…") based only on `/health` probes
