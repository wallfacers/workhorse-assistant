# Design — add-embedded-terminal (S0)

## Context

S0 is the foundation for the whole product: prove that a full-screen TUI such
as `claude` or `codex` can be embedded and driven inside a Tauri WebView. Every
later stage depends on this PTY round-trip — S1 (multi-terminal), S2 (connect
to `workhorse-agent` for orchestration), S3 (cross-agent shared context).

Repository constraints (`AGENTS.md`): privileged operations go through Rust
`#[tauri::command]` handlers; the renderer is sandboxed; secrets never enter the
renderer; new privileged grants are declared in `capabilities/default.json` and
recorded in `docs/SECURITY.md`.

## Decisions

### D1 — `portable-pty` over `node-pty` + sidecar
Use the `portable-pty` crate (from the wezterm project) in the Rust core. It
wraps ConPTY on Windows and openpty on Unix behind one API, so a single codepath
serves both targets.

Rejected — `node-pty` + Node sidecar: introduces a second runtime and puts the
privileged `spawn` outside Rust, violating the `AGENTS.md` boundary. Rejected —
embedding a terminal multiplexer (e.g. wezterm-mux) as a sidecar: too heavy, and
it parks terminal state in an external process that is hard to wire to the UI
and to later orchestration.

### D2 — Command / event contract
- `pty_spawn(profile_id: string, cols?: u16, rows?: u16) -> session_id: string`
  — the renderer passes only a **profile id** plus the current viewport size.
  The full command/args are resolved core-side (see D7). Optional `cols`/`rows`
  set the PTY's initial size to avoid a startup flash (see D9).
- `pty_write(session_id: string, data: string)`
- `pty_resize(session_id: string, cols: u16, rows: u16)`
- `pty_kill(session_id: string)`
- Events use per-session topics:
  - `pty://output/{session_id}` with payload `{ data: string }` (UTF-8 chunk)
  - `pty://exit/{session_id}` with payload `{ code: i32, signal?: string }`

Per-session topics keep S1 multi-terminal routing trivial: each `Terminal`
component subscribes only to its own session's topics.

**Tauri integration.** The `SessionRegistry` is registered with the app via
`Builder::manage(SessionRegistry::default())` and accessed inside command
handlers through `tauri::State<'_, SessionRegistry>`. The reader loop runs on a
dedicated thread that holds a cloned `AppHandle` (which is `Send + Sync`); the
loop emits the per-session events through that handle. (A Tauri v2
`ipc::Channel` is the future upgrade path for higher-throughput output; events
are sufficient and simpler for S0.)

### D3 — Output encoding and backpressure
The reader reads raw bytes from the PTY master on its dedicated thread and runs
them through an **incremental UTF-8 decoder** that holds back a partial trailing
multi-byte sequence until the next read, so characters split across read
boundaries are never corrupted. The read buffer is a fixed **8 KiB**. A bounded
channel between reader and emitter provides simple backpressure. S0 keeps this
minimal; throughput tuning (and an optional xterm WebGL addon) is deferred.

### D4 — Profiles are core-side constants resolved by id
S0 hardcodes the profile set as a constant map in Rust, keyed by `profile_id`.
The renderer never sends `command`/`args` (see D7). Paths are built at runtime
from `dirs::home_dir()` — never a literal `~`, because `Command` spawns without
a shell and would not expand it (see D8).

S0 profiles:

| profile_id    | label        | command  | args                                                          | notes |
|---------------|--------------|----------|---------------------------------------------------------------|-------|
| `shell`       | `shell`      | `$SHELL` / `powershell.exe` | `[]`                                       | default mount; user's login shell on Unix (`bash` fallback), PowerShell on Windows. Always available — no auth/install needed; used to verify raw ANSI/resize (ls/vim/htop) |
| `claude-opus` | `claude+opus`| `claude` | `["--settings", <home>/.claude/settings.json.cc_w]`           | native Anthropic; `cc_w` pins model `opus[1m]` (Opus, 1M-token context), no env override |
| `claude-glm`  | `claude+GLM` | `claude` | `["--settings", <home>/.claude/settings.json.glm_w]`          | Zhipu GLM via an Anthropic-compatible endpoint |
| `codex`       | `codex`      | `codex`  | `[]`                                                          | binary confirmed on PATH as `codex` |

**Vendor-suffix legend** for the user's existing `~/.claude/settings.json.<vendor>_w`
files (each overrides `ANTHROPIC_BASE_URL` / token / model to route Claude Code
at a different backend): `cc` = native Anthropic Claude models; `ds` = DeepSeek;
`glm` = Zhipu GLM; `aly_*` = Aliyun, which hosts several vendors' models (e.g.
`aly_glm_w`, `aly_qwen_w`); `kimi` = Moonshot Kimi; `qwen` = Qwen. The trailing
`_w` is part of the user's existing file-naming convention (meaning not
otherwise specified here). `opus[1m]` denotes Opus with a 1M-token context window.

Model routing for claude profiles is expressed solely as the chosen settings
file. S1 adds UI selection + persistence; S2 has the main agent author profiles
conversationally — at which point a separate core-side **create/validate**
command owns profile creation, so raw command/args still never cross the
renderer boundary at spawn time.

### D5 — Platform strategy
One `portable-pty` codepath. On WSL/Linux it uses openpty (verified directly in
this environment). On Windows it uses ConPTY (operator runs `cargo build` then a
PowerShell smoke test). Profile `command` and settings paths differ per platform
(WSL: `claude` + `<home>/.claude/settings.json.glm_w`; Windows: the Windows
claude install + a PowerShell profile). S0 only guarantees the Linux profiles
run end to end and that the code compiles on Windows.

### D6 — Center-pane mounting
S0 renders a single `Terminal` in the center pane (a `TerminalPane`, taking the
slot currently held by `MainChat`). `Sidebar` and `RightPanel` are untouched.
S1 introduces a multi-tab container around the terminal.

### D7 — Renderer passes a profile id, not a profile
`pty_spawn` takes `profile_id`, not a `LaunchProfile`. The core looks the id up
in its constant map and spawns the resolved command. This removes a redundant
round-trip and, more importantly, denies the (semi-trusted) renderer any ability
to influence the spawned `command`/`args` — the security boundary requirement
holds cleanly. Unknown ids return a structured error.

### D8 — Path / env / cwd resolution in the core
- **Tilde / home:** settings paths are assembled with `dirs::home_dir().join(...)`.
  No `~` ever reaches `Command`, which does not run a shell.
- **`env` semantics:** the child **inherits the parent process environment** and
  then a profile's optional `env` map is layered on top (override/add). This
  guarantees the child still finds `PATH`, `HOME`, etc.
- **`cwd` default:** if a profile omits `cwd`, the child starts in
  `dirs::home_dir()` for S0. S1 wires a per-project working directory.

### D9 — Initial size + resize hygiene
- `pty_spawn` accepts optional `cols`/`rows`; the renderer passes the measured
  container size so the child sees the correct geometry immediately (no 80×24
  flash). If omitted, the PTY defaults to 80×24.
- `pty_resize` (and the `ResizeObserver` that drives it) is **debounced ~80 ms**
  in the renderer to avoid a resize storm while the window is being dragged.
- `cols`/`rows` are validated in the core: `1..=1000` columns, `1..=500` rows;
  out-of-range values return a structured error rather than reaching the PTY.

### D10 — Termination and app-exit cleanup
`pty_kill` terminates the child **immediately** via `portable-pty`'s
`Child::kill` (SIGKILL on Unix, `TerminateProcess` on Windows). Graceful
SIGTERM-then-timeout is deferred to S1+. Because a React unmount may not fire
when the OS window is closed, the Rust side ALSO hooks app shutdown
(`RunEvent::Exit`, and window-destroyed) to iterate the `SessionRegistry` and
kill every live session, so no child outlives the app.

The renderer-side teardown order matters: detach the output/exit listeners,
`await pty_kill(session_id)`, then `term.dispose()` — disposing before the kill
resolves can leave the child briefly writing to a destroyed terminal.

### D11 — No new Tauri capability is required
App-defined `#[tauri::command]` handlers registered via `invoke_handler` are
**not** gated by Tauri v2's capability/permission ACL — that ACL governs plugin
and core commands. The existing `app_info` / `greet` commands prove this: they
work with no entry in `capabilities/default.json`. The PTY commands therefore
need no capability grant. Event listening (`listen('pty://…')`) is already
permitted by the `core:default` set already present. Consequently this change
adds **no** permission to `capabilities/default.json`; instead it records the
new (ACL-ungoverned but security-relevant) process-spawn power and the
plaintext-token exception narratively in `docs/SECURITY.md`.

## Risks

- ConPTY can exhibit redraw quirks with some complex full-screen TUIs. Claude
  Code and Codex test fine in practice, but this is logged as a known risk for
  the Windows smoke step.
- High-volume output pressures the renderer main thread; mitigation (xterm
  WebGL addon, or moving output onto a Tauri `ipc::Channel`) is available later
  and not required for S0.
- Orphan processes: the component must `pty_kill` and join the reader loop on
  unmount / window close, or zombies accumulate. Covered by the lifecycle
  requirement and a verification step.
- Plaintext vendor tokens: the `claude --settings` files hold tokens in plain
  text on disk. This is the user's pre-existing Claude Code configuration, not a
  secret store our app creates, but it is in tension with `SECURITY.md`'s
  "never in plaintext on disk" rule. S0 documents an explicit, scoped exception
  in `SECURITY.md` (see tasks 2.3); real hardening is deferred to S2+.
