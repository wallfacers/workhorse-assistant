## Context

A **project** in `workhorse-assistant` is a local path used as the sidecar's
`workdir` (`project-sessions`: "Project model scoped to a local path"). The
session layer is already directory-per-request: `POST /v1/sessions {workdir}`,
sessions persisted keyed by encoded path (`<dataDir>/projects/<encoded-path>/…`,
borrowed from Claude Code). The assistant already owns project state
(`currentProject` in `localStorage`, `recentProjects`, `ProjectBrowser`,
`openProject`).

Two leftover points still assume "launch cwd = project":

1. **`workhorse-agent` `internal/api/health.go:defaultWorkdir()`** resolves
   `config override > os.Getwd()`. With no override, `GET /health.default_workdir`
   returns the **sidecar process launch directory** (e.g.
   `D:\develop\python\source\workhorse-agent`).
2. **`workhorse-agent` `internal/api/fs.go:isWithinWorkdir(path, cfg.DefaultWorkdir)`**
   confines `/v1/fs` browsing to **one global** `cfg.DefaultWorkdir`.

The assistant then (a) cold-start-adopts that launch dir as the project, and
(b) `SessionProvider.tsx:projectMismatch` (line 403) nags the user to "switch to
the agent's directory" whenever a remembered project has zero sessions.

`opencode` (`packages/opencode/src/project/instance.ts`) is the reference model:
the directory is a **per-request parameter** (`Instance.provide({ directory, fn })`,
cached per directory); the process cwd is merely a default, and confinement is a
per-request `Instance.directory` check — one server serves N directories. Claude
Code sidesteps the question by launching one process per `cd`-ed directory.

## Goals / Non-Goals

**Goals:**
- The sidecar's `default_workdir` is a **stable, meaningful** value (home dir),
  never the accidental launch cwd.
- `/v1/fs` browsing follows the **requested project `workdir`**, so any project
  the user opens is browsable — even with a configured global default.
- A project with zero sessions routes the user to the **picker**, not to the
  sidecar's directory.

**Non-Goals:**
- Re-architecting the sidecar into opencode's full per-directory `Instance`
  caching — we adopt only the per-request-confinement principle for `/v1/fs`.
- Git-root detection / worktree discovery (`Project.fromDirectory`) — a project
  stays the exact path the user picked, verbatim (`project-sessions` invariant).
- Multi-user / sandbox semantics; terminal re-scoping by project (separate work).
- Changing the wire `protocol_version` — all `/health` fields here are additive.

## Decisions

### D1 — Sidecar `default_workdir` falls back to the user's home directory
`defaultWorkdir()` becomes `config override > os.UserHomeDir() > "" (omit)`. The
launch cwd (`os.Getwd()`) is removed from the chain entirely.

- **Why home over launch cwd?** A long-running desktop sidecar's launch dir is an
  accident of how it was started; home is stable across launches and is a benign
  place to land before the user picks a real project. The existing `wsl-remote`
  cold-start scenario already *exemplifies* the default as `/home/user`.
- **Why omit (not "/") when home is unknown?** An omitted `default_workdir` makes
  the assistant fall through to the picker (`wsl-remote`: "Cold start with no
  default falls back to the picker"), which is the correct UX — better than
  seeding a useless root.
- **Alternative considered:** keep `os.Getwd()` but have the assistant ignore it.
  Rejected — it leaves a misleading field in the public `/health` contract that
  any consumer could trust.

### D2 — `/v1/fs` confinement follows the requested `workdir`, not a global default
`isWithinWorkdir` is evaluated against the **project path the request is browsing**
(derived from the active session / an explicit query param), mirroring opencode's
per-request `Instance.directory` check. `cfg.DefaultWorkdir` stops being the single
confinement root.

- **Why:** with the global guard, setting `server.default_workdir` would `403`
  every project opened elsewhere — the exact opposite of "any local directory."
- **Contract shape:** the `/v1/fs` endpoint accepts the project root it is scoped
  to (query param or session-derived); the guard confines results to that root,
  and still rejects path-escape attempts. **BREAKING** for callers that relied on
  the implicit global root.
- **Alternative considered:** maintain a set of "registered" workdirs and allow
  browsing any of them. Rejected as more state than needed — the assistant always
  knows which project it is browsing and can pass it.

### D3 — Assistant: demote `default_workdir` to a cold-start seed; reframe the nag
`SessionProvider.tsx` uses `agent.defaultWorkdir` **only** when there is no
remembered project. `projectMismatch` (and its i18n strings) is replaced by a
neutral empty-state: a project with zero sessions offers "open a folder / pick a
recent," never "switch to the agent's directory."

- **Why:** the assistant is already the project authority; the nag inverted that
  by treating the sidecar's incidental dir as ground truth.

## Risks / Trade-offs

- **fs contract break** → Sequence the sidecar change with the assistant's
  `ProjectBrowser` change so the renderer always passes the project root; land
  both before relying on a configured `DefaultWorkdir`. Until then `DefaultWorkdir`
  stays empty (unrestricted), so no regression in the interim.
- **Cross-repo coordination** (sidecar + assistant) → sidecar tasks live in
  `workhorse-agent-tasks.md` (same pattern as `add-project-sessions`); the
  assistant tasks degrade gracefully against an un-upgraded sidecar (it still
  reads `default_workdir`, just gets home instead of launch cwd once deployed).
- **Home dir as default surprises power users who launched in a project dir** →
  acceptable: those users have a remembered project or use the picker; the
  previous behavior only "worked" by coincidence of launch location.
- **Rollback:** revert per repo independently — the assistant reframe and the
  sidecar fallback are not hard-coupled (the assistant tolerates either
  `default_workdir` value).

## Open Questions

- Does `/v1/fs` take the project root as an explicit query param, or derive it
  from a `session_id` on the request? (Leaning explicit param — the browser opens
  a project before any session exists.)
- Should the empty-state distinguish "remembered project gone/empty" from "first
  launch, never picked"? Same affordance either way; copy may differ.
