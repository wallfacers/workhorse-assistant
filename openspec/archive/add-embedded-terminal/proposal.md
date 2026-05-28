## Why

Workhorse Assistant aims to become a desktop shell that runs and orchestrates
multiple coding-agent CLIs (Claude Code, Codex, Gemini, opencode) in one window.
Today the app is only a three-pane scaffold (`Sidebar` / `MainChat` /
`RightPanel`) with `app_info` / `greet` smoke commands. Before any
orchestration is possible, the app must be able to **embed and run** these
interactive full-screen TUI CLIs inside its own window.

This change delivers that foundation: a single embedded pseudo-terminal in the
center pane that can launch a configured CLI via a *launch profile* and
interact with it bidirectionally, cross-platform (ConPTY on Windows, openpty on
Unix from one Rust codepath).

Model routing for claude-based agents is achieved purely by launching
`claude --settings <vendor-settings-file>` — e.g. GLM and DeepSeek via their
Anthropic-compatible endpoints. "claude code + GLM" is therefore just a launch
profile, **not** an in-app API call. Vendor secrets stay in the on-disk
settings files read by the spawned child process and never enter the renderer,
which aligns with the `SECURITY.md` boundary.

## What Changes

- Add a new `embedded-terminal` capability: a PTY-backed terminal session
  managed by the Rust core and rendered in the WebView via `xterm.js`.
- Add a Rust `pty` module built on the `portable-pty` crate (ConPTY on Windows,
  openpty on Unix) — a single codepath for both platforms.
- Add Tauri commands `pty_spawn(profile_id, cols?, rows?)`, `pty_write`,
  `pty_resize`, `pty_kill` and per-session events `pty://output/{id}`
  (payload `{ data }`), `pty://exit/{id}` (payload `{ code, signal? }`). These
  are app-defined commands and need no new Tauri capability.
- Add a frontend `Terminal.tsx` component (`xterm.js` + `addon-fit`) wired to
  the commands/events and mounted in the center pane.
- Introduce a `LaunchProfile` shape `{ id, label, command, args[], cwd?, env? }`
  resolved **core-side from a `profile_id`** (the renderer never sends
  command/args), shipping four hardcoded S0 profiles: `shell` (default mount),
  `claude-opus`, `claude-glm`, `codex`.

## Capabilities

### New Capabilities
- `embedded-terminal`: PTY session lifecycle (spawn / write / resize / kill),
  output streaming to the renderer, cross-platform PTY backend, the
  launch-profile model, and the renderer/core security boundary for process
  spawning.

### Modified Capabilities
None. The new Tauri commands register additively in `lib.rs`; no existing
capability changes at the requirement level.

## Impact

- **Code (Rust):** new `src-tauri/src/pty/` module; commands registered in
  `src-tauri/src/lib.rs`; permission grants in
  `src-tauri/capabilities/default.json`. New crate dependency `portable-pty`.
- **Code (Renderer):** new `src/components/Terminal.tsx`; new `src/ipc/pty.ts`
  adapter; center-pane wiring in `src/App.tsx`. New dependencies
  `@xterm/xterm`, `@xterm/addon-fit`.
- **Docs:** `ARCHITECTURE.md` IPC contract table gains the four PTY commands;
  `docs/SECURITY.md` records the new process-spawn power and the plaintext-token
  exception narratively (no new Tauri capability is added — app commands are not
  ACL-gated).
- **Persistence:** none.
- **Security:** process spawning is core-only; the renderer never spawns
  processes nor reads vendor secret files directly, and passes only a
  `profile_id` (plus size/input) across IPC. The pre-existing
  `~/.claude/settings.json.*` files hold plaintext vendor tokens and are read
  only by the spawned `claude` process — never by the renderer. This is in
  tension with `SECURITY.md`'s "never in plaintext on disk" rule, so this change
  records an explicit, scoped exception in `SECURITY.md` (see task 2.3). Real
  hardening (keyring, generated-at-launch settings) is deferred to S2+.
- **Platforms:** the code is cross-platform. S0 is verified on WSL/Linux
  (openpty); Windows is exercised by the operator via `cargo build` plus a
  PowerShell + ConPTY smoke test.
- **Out of scope:** multi-tab / split terminals (S1); orchestration via
  `workhorse-agent` (S2); cross-agent shared context (S3); conversational
  install/config of vendor profiles (S2+); a UI for profile selection (S1);
  secret-file hardening beyond keeping secrets out of the renderer.
