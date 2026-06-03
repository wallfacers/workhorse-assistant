# workhorse-agent tasks

Cross-repo work for `decouple-project-from-launch-cwd`, to be applied in the
sibling `../workhorse-agent` (Go sidecar). Mirrors the pattern from
`add-project-sessions/workhorse-agent-tasks.md`. The assistant tracks these as
§1 in its own `tasks.md`.

## 1. `default_workdir` → home, not launch cwd

- [ ] 1.1 In `internal/api/health.go`, change `defaultWorkdir()` resolution to
      `cfg.DefaultWorkdir` (override) > `os.UserHomeDir()` > omit. Remove the
      `os.Getwd()` fallback entirely.
- [ ] 1.2 When neither override nor home is resolvable, omit `default_workdir`
      from the `/health` JSON (or return empty) so the assistant routes to the
      picker — never report the launch directory.
- [ ] 1.3 Update `internal/api/health_test.go`: no-override → home; override
      honored; unresolvable home → omitted/empty, never the process cwd.

## 2. `/v1/fs` confinement follows the requested workdir

- [ ] 2.1 Make the `/v1/fs` handler scope confinement to the **requested project
      root** (explicit query param, or the requesting session's `workdir`) rather
      than the single global `cfg.DefaultWorkdir` in `isWithinWorkdir`.
- [ ] 2.2 Keep path-escape rejection: a path outside the scoped root still returns
      `403 forbidden`; preserve the existing virtual-FS guard.
- [ ] 2.3 Decide the request shape with the assistant (design Open Question):
      explicit `root`/`workdir` query param is preferred over session-derived,
      since the browser opens a project before any session exists.
- [ ] 2.4 Update `internal/api/fs_test.go`: browse within an arbitrary requested
      root succeeds even when a different global default is configured; escape
      attempts 403.

## 3. `GET /v1/sessions` (no workdir) returns the full persisted list

- [ ] 3.1 In `internal/api/sessions.go`, change the no-`workdir` branch of
      `handleListSessions` to source from `store.ListSessions(ctx, includeDeleted=false)`
      (the full persisted set across projects) instead of `manager.ListSessions()`
      (in-memory live only).
- [ ] 3.2 Overlay live status: for each persisted row, report `running` when a
      live session for that id is mid-turn, else `idle` (same overlay pattern as
      `listSessionsByWorkdir`). Ensure each row carries its `workdir`.
- [ ] 3.3 Keep `?workdir=P` behavior unchanged (still returns `P`'s sessions for
      the in-app switcher). The change is only the no-arg branch.
- [ ] 3.4 Update `internal/api/sessions_test.go`: no-arg list returns idle
      persisted sessions from multiple workdirs, each with its `workdir` field.

## 4. Verification

- [ ] 4.1 `go test ./...` green.
- [ ] 4.2 Confirm `protocol_version` is unchanged (all `/health` changes are
      additive / value-only — no wire-version bump).
