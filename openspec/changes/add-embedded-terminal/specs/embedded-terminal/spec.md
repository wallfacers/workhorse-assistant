# embedded-terminal Specification

## ADDED Requirements

### Requirement: PTY-backed process spawning

The system SHALL spawn a child process attached to a pseudo-terminal, using a
single cross-platform codepath (ConPTY on Windows, openpty on Unix via
`portable-pty`). The renderer SHALL initiate a spawn by supplying a
`profile_id` and an optional initial size; the core resolves the id to a
command and arguments (see "Launch profile resolution"). The spawn SHALL return
a unique session identifier.

#### Scenario: Spawn an interactive shell

- **WHEN** the renderer calls `pty_spawn` with a shell `profile_id`
- **THEN** a child shell process starts attached to a PTY
- **AND** the command returns a unique `session_id`

#### Scenario: Spawn a vendor-routed claude session

- **WHEN** the renderer calls `pty_spawn` with `profile_id` `claude-glm`
- **THEN** the core spawns `claude --settings <home>/.claude/settings.json.glm_w`
- **AND** the claude TUI renders in the terminal view

#### Scenario: Initial size avoids a startup flash

- **WHEN** `pty_spawn` is called with `cols` and `rows` matching the container
- **THEN** the PTY is created at that size and the child sees the correct
  geometry from its first frame

#### Scenario: Spawn fails for an unknown profile id

- **WHEN** `pty_spawn` is called with a `profile_id` that is not in the core map
- **THEN** the command returns a structured error and no session is registered

#### Scenario: Spawn fails for a missing binary

- **WHEN** the resolved command for a profile is not found on PATH
- **THEN** the command returns a structured error and no session is registered

### Requirement: Launch profile resolution and model routing

The system SHALL define launch profiles with the shape
`{ id, label, command, args[], cwd?, env? }`, resolved **core-side** from a
profile id; the renderer SHALL NOT supply `command` or `args`. The S0 build
SHALL ship hardcoded profiles `shell` (the user's login shell; the default
mount), `claude-opus`, `claude-glm`, and `codex`. Settings
paths SHALL be built from the resolved home directory (no literal `~`, since the
child is spawned without a shell). Model routing for claude-based profiles SHALL
be expressed solely as `claude --settings <vendor-settings-file>`, not as in-app
API calls.

#### Scenario: GLM profile maps to a settings file

- **WHEN** the `claude-glm` profile is resolved
- **THEN** the launched command is `claude` with args
  `["--settings", "<home>/.claude/settings.json.glm_w"]`
- **AND** the `~` is expanded to the absolute home directory by the core
- **AND** no Anthropic-vendor API call originates from the renderer

#### Scenario: Renderer cannot influence command or args

- **WHEN** the renderer initiates a spawn
- **THEN** only the `profile_id` (plus optional size) crosses the IPC boundary
- **AND** the command and arguments are taken solely from the core's profile map

### Requirement: Child environment and working directory

The system SHALL start the child with the **parent process environment merged
with** the profile's optional `env` map (profile values override). When a
profile omits `cwd`, the child SHALL start in the resolved home directory.

#### Scenario: Child inherits PATH and applies overrides

- **WHEN** a profile with an `env` override is spawned
- **THEN** the child sees the parent environment (including `PATH`, `HOME`) with
  the profile's `env` entries added or overriding

#### Scenario: Default working directory

- **WHEN** a profile without `cwd` is spawned
- **THEN** the child's working directory is the resolved home directory

### Requirement: Output streaming to the renderer

The system SHALL stream child PTY output to the renderer as incremental UTF-8
text via a per-session event `pty://output/{session_id}` with payload
`{ data: string }`, preserving ANSI/VT escape sequences and never corrupting a
multi-byte character split across reads.

#### Scenario: ANSI full-screen output renders

- **WHEN** the child process emits ANSI escape sequences or alternate-screen content
- **THEN** the renderer's xterm displays it correctly, including colors, cursor
  movement, and full-screen redraw

#### Scenario: Multi-byte UTF-8 split across chunks

- **WHEN** a multi-byte UTF-8 character is split across two PTY read boundaries
- **THEN** the emitted `{ data }` contains the intact character with no
  replacement or garbage glyphs

### Requirement: Input forwarding

The system SHALL forward renderer keystrokes to the PTY master via
`pty_write(session_id, data)`. A write to an unknown or already-exited session
SHALL return a structured error.

#### Scenario: Keystrokes reach the child

- **WHEN** the user types in the terminal view and `pty_write` is invoked with
  the corresponding bytes
- **THEN** the child process receives the input on its PTY stdin

#### Scenario: Write to a non-existent or exited session

- **WHEN** `pty_write` is called with a `session_id` that is unknown or whose
  child has already exited
- **THEN** the command returns a structured error and no panic occurs

### Requirement: Resize synchronization

The system SHALL resize the PTY to match the terminal viewport via
`pty_resize(session_id, cols, rows)`. The core SHALL validate `cols` in
`1..=1000` and `rows` in `1..=500`; out-of-range values SHALL return a
structured error. A resize on an unknown session SHALL return a structured error.

#### Scenario: Pane resize reflows the TUI

- **WHEN** the terminal view changes size and `pty_resize` is invoked with the
  new in-range `cols`/`rows`
- **THEN** the PTY is resized and a full-screen child application redraws at the
  new dimensions

#### Scenario: Out-of-range dimensions rejected

- **WHEN** `pty_resize` is invoked with `cols` `0` or beyond the allowed bounds
- **THEN** the command returns a structured error and the PTY size is unchanged

### Requirement: Session lifecycle and teardown

The system SHALL terminate the child process **immediately** (SIGKILL on Unix,
`TerminateProcess` on Windows) and stop the read loop on `pty_kill` or renderer
teardown, leaving no orphan process. The system SHALL also kill every live
session when the application exits or its window is destroyed, independently of
any renderer-side teardown. A child that exits on its own SHALL emit
`pty://exit/{session_id}` with payload `{ code: i32, signal?: string }`. A
`pty_kill` on an unknown session SHALL return a structured error.

#### Scenario: Closing the terminal cleans up

- **WHEN** the terminal view unmounts or `pty_kill` is called
- **THEN** the child process is terminated, the read loop stops, and the session
  is removed from the registry
- **AND** no orphan process remains

#### Scenario: Application exit kills all sessions

- **WHEN** the application exits or the window is destroyed while sessions are live
- **THEN** the core iterates the session registry and kills every child process
- **AND** no orphan process survives app shutdown, even if no renderer unmount fired

#### Scenario: Child exits on its own

- **WHEN** the child process exits by itself
- **THEN** a `pty://exit/{session_id}` event is emitted carrying `{ code, signal? }`

### Requirement: Renderer/core security boundary

Process spawning SHALL occur only in the Rust core. The renderer SHALL NOT spawn
processes nor read vendor secret files directly, and SHALL pass only a
`profile_id` (plus size/input data) across the IPC boundary. The PTY commands
are exposed as app-defined `#[tauri::command]` handlers via `invoke_handler`;
no new Tauri capability is added (app commands are not ACL-gated in Tauri v2,
and event listening is already permitted by the existing `core:default` set).
The new process-spawn power and the plaintext-token exception SHALL be recorded
in `docs/SECURITY.md`.

#### Scenario: Renderer routes spawning through a command

- **WHEN** the renderer needs to start a CLI session
- **THEN** it calls `pty_spawn` with a `profile_id` rather than any direct
  process API or raw command string
- **AND** the command and arguments come solely from the core's profile map
- **AND** vendor secret tokens are read only by the spawned child process and
  never pass through the renderer
