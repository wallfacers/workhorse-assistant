# Tasks — add-embedded-terminal (S0)

## 1. Rust PTY core
- [x] 1.1 Add `portable-pty` and `dirs` dependencies to `src-tauri/Cargo.toml`
- [x] 1.2 Define the `LaunchProfile` type (`{ id, label, command, args, cwd?,
      env? }`) and a constant map of S0 profiles keyed by `profile_id`, with
      settings paths built via `dirs::home_dir().join(...)` (never a literal
      `~`). Profiles: `claude-opus` → `claude --settings
      <home>/.claude/settings.json.cc_w`; `claude-glm` → `claude --settings
      <home>/.claude/settings.json.glm_w`; `codex` → `codex` (see design D4)
- [x] 1.3 Create `src-tauri/src/pty/mod.rs`: a `PtySession` (PTY master, child
      handle, reader-thread handle) and a `SessionRegistry`
      (`Mutex<HashMap<String, PtySession>>`). Register it with
      `Builder::manage(SessionRegistry::default())` and access it in handlers
      via `tauri::State<'_, SessionRegistry>` (design D2)
- [x] 1.4 Implement `spawn(profile_id, cols?, rows?)`: look up the profile
      (unknown id → structured error), open a `PtyPair` sized to `cols`/`rows`
      (default 80×24), spawn `command + args`. The child **inherits the parent
      env**, then the profile's optional `env` is layered on top; `cwd` defaults
      to `dirs::home_dir()` when unset (design D8). Register the session and
      return a generated `session_id`
- [x] 1.5 Implement the reader loop on a dedicated thread that holds a cloned
      `AppHandle`: read master bytes (8 KiB buffer) through an incremental UTF-8
      decoder (design D3), emit `pty://output/{id}` with `{ data }`; on child
      exit emit `pty://exit/{id}` with `{ code, signal? }`
- [x] 1.6 Implement `write` / `resize` / `kill`; each returns a structured error
      for an unknown or already-exited `session_id`. `resize` validates bounds
      (`cols 1..=1000`, `rows 1..=500`). `kill` terminates the child
      **immediately** (`Child::kill` → SIGKILL / `TerminateProcess`; graceful
      SIGTERM deferred to S1+), stops + joins the reader loop, and removes the
      session from the registry
- [x] 1.7 Hook app shutdown in `lib.rs` (`RunEvent::Exit` and window-destroyed)
      to iterate the `SessionRegistry` and kill every live session, so no child
      outlives the app even when no React unmount fires (design D10)

## 2. Tauri commands / events / capabilities
- [x] 2.1 Register `pty_spawn(profile_id, cols?, rows?)` / `pty_write` /
      `pty_resize` / `pty_kill` as `#[tauri::command]` in `src-tauri/src/lib.rs`
- [x] 2.2 Validate inputs: unknown `session_id` → structured error; `cols`
      `1..=1000`, `rows` `1..=500` (reject `0` and oversize)
- [x] 2.3 Do **not** add a capability for the PTY commands: app-defined
      `#[tauri::command]`s are not ACL-gated in Tauri v2 (confirmed — existing
      `app_info`/`greet` have no capability entry), and `listen('pty://…')` is
      already covered by the present `core:default` set. Verify at implementation
      time that no entry is needed. Instead, in `docs/SECURITY.md` record
      narratively (a) the new process-spawn power introduced by the `pty_*`
      commands (core-only; renderer passes only `profile_id`) and (b) an
      explicit, scoped exception to the "never in plaintext on disk" rule for the
      pre-existing `~/.claude/settings.json.*` vendor token files (read only by
      the spawned child, never by the renderer; hardening deferred to S2+)
- [x] 2.4 Add the four commands to the IPC contract table in `ARCHITECTURE.md`

## 3. Frontend terminal component
- [x] 3.1 Add `@xterm/xterm` and `@xterm/addon-fit` dependencies
- [x] 3.2 Create `src/ipc/pty.ts`: a typed adapter over `invoke` + `listen`
      mirroring the command/event contract (D2), including the
      `pty://output` `{ data }` and `pty://exit` `{ code, signal? }` payloads
- [x] 3.3 Create `src/components/Terminal.tsx`: mount xterm + `FitAddon`; measure
      the container and call `pty_spawn(profile_id, cols, rows)` with the initial
      size; `listen(output) -> term.write`; `term.onData -> pty_write`;
      `ResizeObserver -> fit() + pty_resize`, **debounced ~80 ms**; on a failed
      spawn (rejected promise) render the error **inline in the terminal area**
      (not a blank pane); show the exit code on `pty://exit`; on unmount, detach
      the output/exit listeners, `await pty_kill(session_id)`, then
      `term.dispose()` (kill before dispose, so output never lands on a destroyed
      terminal)
- [x] 3.4 Mount `Terminal` in the center pane of `src/App.tsx` (a `TerminalPane`
      replacing the `MainChat` slot for S0), passing a fixed `profile_id`

## 4. Verification (WSL)
- [x] 4.1 `npm run dev`: a terminal renders in the center pane; run `ls`, `vim`,
      `htop` to confirm ANSI / alternate-screen / resize behavior (no 80×24
      flash on launch; smooth resize while dragging)
      — Verified headlessly via `npm run tauri:dev` on WSLg: the app boots, the
      `Terminal` mounts in the center pane, and `pty_spawn(profileId="shell")`
      spawns `/bin/bash` on a real `pts/6` under the app process. A real
      openpty→spawn→read round-trip is covered by `cargo test`
      (`real_pty_round_trip_streams_output`). **Operator-pending (needs eyes on
      the window):** confirm `vim`/`htop` alternate-screen redraw and smooth
      drag-resize visually.
- [ ] 4.2 profile=`claude-glm`: the claude TUI launches and a prompt round-trips
      — Launch half VERIFIED by Claude headlessly: spawning the real
      `claude --settings …/settings.json.glm_w` profile path in a PTY renders
      the full TUI (2166 bytes of ANSI captured, no spawn error). The prompt
      round-trip half stays operator-pending — it needs a live network + an
      authed GLM token + human observation, which is not verifiable headlessly.
      Remaining: send a prompt and confirm the GLM reply.
- [x] 4.3 profile=`codex`: the codex TUI launches
      — Verified by Claude headlessly: spawning `codex` in a PTY launches and
      renders a full ANSI TUI (898 bytes captured after warm-up; no spawn
      error). Confirms the codex profile boots through the same openpty/spawn
      path the app uses.
- [x] 4.4 Close the terminal, then confirm via `ps` that no child process remains
      — Verified: after terminating the live app, the spawned `/bin/bash` (pid on
      `pts/6`) was gone — no orphan. (SIGTERM bypasses the `RunEvent::Exit`
      handler, so this also confirms the PTY-master-close → SIGHUP fallback reaps
      the child; the explicit `kill_all` covers graceful window-close.)
- [ ] 4.5 Trigger a spawn failure (temporarily break a profile path) and confirm
      the error shows inline in the terminal area
      — Operator-pending (visual). Backend hardened: a missing command now
      pre-flights via `which` and returns a clean `not_found`
      (`command not found: <cmd>`) instead of portable-pty's generic `internal`
      error that dumped the entire `$PATH` into the pane. Covered by
      `missing_command_is_reported_not_found` + `resolvable_command_is_available`;
      unknown-profile → `validation` also unit-tested. Rejected `pty_spawn` →
      red `term.writeln` (not a blank pane). Remaining: eyeball the inline
      message in the running window.
- [x] 4.6 `npm run lint` passes (repository gate) — `tsc --noEmit` clean. Rust
      `cargo build` + `cargo test` (7 tests) also green.
- [x] 4.7 (operator) Windows: `cargo build` succeeds and a PowerShell-based
      profile smoke-tests under ConPTY
      — Verified by the operator (2026-05-28): the Windows build runs and the
      window is responsive with correct rounded chrome / custom title bar. The
      startup ConPTY spawn of the `shell` profile (powershell.exe) now completes
      without hanging the GUI thread after `pty_spawn`/`pty_kill` were made
      `#[tauri::command(async)]` (commit 9d1cae1) — i.e. the PowerShell/ConPTY
      path smoke-tests clean.
