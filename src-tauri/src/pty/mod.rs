//! PTY-backed terminal sessions.
//!
//! A single cross-platform codepath (ConPTY on Windows, openpty on Unix via
//! `portable-pty`) spawns CLI processes resolved from a *launch profile* and
//! streams their output to the renderer. Process spawning lives only here in
//! the core; the renderer passes a `profile_id`, never a command line.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::thread::JoinHandle;

use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

const DEFAULT_COLS: u16 = 80;
const DEFAULT_ROWS: u16 = 24;
const MAX_COLS: u16 = 1000;
const MAX_ROWS: u16 = 500;
const READ_BUF: usize = 8 * 1024;

static SESSION_COUNTER: AtomicU64 = AtomicU64::new(0);

/// Renderer-facing error mirroring `src/ipc/result.ts`'s `IpcError` shape, so
/// `toIpcError` maps it without parsing the message.
#[derive(Debug, Serialize)]
pub struct PtyError {
    pub kind: ErrorKind,
    pub message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorKind {
    Validation,
    NotFound,
    Internal,
}

impl PtyError {
    fn validation(message: impl Into<String>) -> Self {
        Self { kind: ErrorKind::Validation, message: message.into() }
    }
    fn not_found(message: impl Into<String>) -> Self {
        Self { kind: ErrorKind::NotFound, message: message.into() }
    }
    fn internal(message: impl Into<String>) -> Self {
        Self { kind: ErrorKind::Internal, message: message.into() }
    }
}

/// A launch profile resolved core-side from a `profile_id`. The renderer never
/// supplies `command`/`args` — only the id.
struct LaunchProfile {
    command: String,
    args: Vec<String>,
    cwd: Option<PathBuf>,
    env: Vec<(String, String)>,
}

/// Resolve a `profile_id` to its launch profile. Settings paths are built from
/// the real home directory (never a literal `~`, since the child is spawned
/// without a shell). See design D4.
fn resolve_profile(profile_id: &str) -> Option<LaunchProfile> {
    let home = dirs::home_dir();
    let settings = |file: &str| -> Option<String> {
        home.as_ref().map(|h| h.join(".claude").join(file).to_string_lossy().into_owned())
    };
    match profile_id {
        "shell" => {
            // Default profile: the user's login shell, for raw terminal use and
            // verification (ls/vim/htop). Always available, no auth needed.
            #[cfg(windows)]
            let command = "powershell.exe".to_string();
            #[cfg(not(windows))]
            let command = std::env::var("SHELL").unwrap_or_else(|_| "bash".to_string());
            Some(LaunchProfile { command, args: Vec::new(), cwd: None, env: Vec::new() })
        }
        "claude-opus" => Some(LaunchProfile {
            command: "claude".into(),
            args: vec!["--settings".into(), settings("settings.json.cc_w")?],
            cwd: None,
            env: Vec::new(),
        }),
        "claude-glm" => Some(LaunchProfile {
            command: "claude".into(),
            args: vec!["--settings".into(), settings("settings.json.glm_w")?],
            cwd: None,
            env: Vec::new(),
        }),
        "codex" => Some(LaunchProfile {
            command: "codex".into(),
            args: Vec::new(),
            cwd: None,
            env: Vec::new(),
        }),
        _ => None,
    }
}

#[derive(Serialize, Clone)]
struct OutputPayload {
    data: String,
}

#[derive(Serialize, Clone)]
struct ExitPayload {
    code: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    signal: Option<String>,
}

/// One live PTY session: the master (for resize), a writer (for input), a
/// killer handle (to terminate from any thread), and the reader thread.
struct PtySession {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    killer: Box<dyn ChildKiller + Send + Sync>,
    reader: Option<JoinHandle<()>>,
}

/// App-managed registry of live sessions. Registered via `Builder::manage` and
/// accessed in command handlers through `tauri::State<'_, SessionRegistry>`.
#[derive(Default)]
pub struct SessionRegistry {
    sessions: Mutex<HashMap<String, PtySession>>,
}

impl SessionRegistry {
    pub fn spawn(
        &self,
        app: &AppHandle,
        profile_id: &str,
        cols: Option<u16>,
        rows: Option<u16>,
    ) -> Result<String, PtyError> {
        let profile = resolve_profile(profile_id)
            .ok_or_else(|| PtyError::validation(format!("unknown profile id: {profile_id}")))?;

        let cols = cols.unwrap_or(DEFAULT_COLS);
        let rows = rows.unwrap_or(DEFAULT_ROWS);
        validate_size(cols, rows)?;

        let pair = native_pty_system()
            .openpty(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
            .map_err(|e| PtyError::internal(format!("openpty failed: {e}")))?;

        let mut cmd = CommandBuilder::new(&profile.command);
        cmd.args(&profile.args);
        // Child inherits the parent environment, then profile overrides layer on
        // top — so it still finds PATH/HOME (design D8).
        for (k, v) in std::env::vars() {
            cmd.env(k, v);
        }
        for (k, v) in &profile.env {
            cmd.env(k, v);
        }
        let cwd = profile.cwd.or_else(dirs::home_dir);
        if let Some(dir) = cwd {
            cmd.cwd(dir);
        }

        let child = pair.slave.spawn_command(cmd).map_err(|e| {
            if let Some(io) = e.downcast_ref::<std::io::Error>() {
                if io.kind() == std::io::ErrorKind::NotFound {
                    return PtyError::not_found(format!("command not found: {}", profile.command));
                }
            }
            PtyError::internal(format!("spawn failed: {e}"))
        })?;
        // Drop the slave in the parent so the master reader sees EOF on child exit.
        drop(pair.slave);

        let killer = child.clone_killer();
        let reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| PtyError::internal(format!("clone reader failed: {e}")))?;
        let writer = pair
            .master
            .take_writer()
            .map_err(|e| PtyError::internal(format!("take writer failed: {e}")))?;

        let session_id = format!("pty-{}", SESSION_COUNTER.fetch_add(1, Ordering::Relaxed));
        let reader_handle =
            spawn_reader(app.clone(), session_id.clone(), reader, child);

        self.sessions.lock().unwrap().insert(
            session_id.clone(),
            PtySession { master: pair.master, writer, killer, reader: Some(reader_handle) },
        );
        Ok(session_id)
    }

    pub fn write(&self, session_id: &str, data: &str) -> Result<(), PtyError> {
        let mut sessions = self.sessions.lock().unwrap();
        let session = sessions
            .get_mut(session_id)
            .ok_or_else(|| PtyError::not_found(format!("unknown session: {session_id}")))?;
        session
            .writer
            .write_all(data.as_bytes())
            .and_then(|_| session.writer.flush())
            .map_err(|e| PtyError::internal(format!("write failed: {e}")))
    }

    pub fn resize(&self, session_id: &str, cols: u16, rows: u16) -> Result<(), PtyError> {
        validate_size(cols, rows)?;
        let sessions = self.sessions.lock().unwrap();
        let session = sessions
            .get(session_id)
            .ok_or_else(|| PtyError::not_found(format!("unknown session: {session_id}")))?;
        session
            .master
            .resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
            .map_err(|e| PtyError::internal(format!("resize failed: {e}")))
    }

    pub fn kill(&self, session_id: &str) -> Result<(), PtyError> {
        let session = self
            .sessions
            .lock()
            .unwrap()
            .remove(session_id)
            .ok_or_else(|| PtyError::not_found(format!("unknown session: {session_id}")))?;
        terminate(session);
        Ok(())
    }

    /// Kill every live session, e.g. on app exit — independent of any
    /// renderer-side teardown (design D10).
    pub fn kill_all(&self) {
        let drained: Vec<PtySession> =
            self.sessions.lock().unwrap().drain().map(|(_, s)| s).collect();
        for session in drained {
            terminate(session);
        }
    }
}

fn validate_size(cols: u16, rows: u16) -> Result<(), PtyError> {
    if !(1..=MAX_COLS).contains(&cols) || !(1..=MAX_ROWS).contains(&rows) {
        return Err(PtyError::validation(format!(
            "size out of range: cols={cols} (1..={MAX_COLS}), rows={rows} (1..={MAX_ROWS})"
        )));
    }
    Ok(())
}

/// Terminate a session immediately (SIGKILL / TerminateProcess) and join its
/// reader thread. Graceful SIGTERM is deferred to S1+ (design D10).
fn terminate(mut session: PtySession) {
    let _ = session.killer.kill();
    if let Some(handle) = session.reader.take() {
        let _ = handle.join();
    }
}

/// Reader thread: stream child output as incremental UTF-8, then emit the exit
/// event once the child closes the PTY.
fn spawn_reader(
    app: AppHandle,
    session_id: String,
    mut reader: Box<dyn Read + Send>,
    mut child: Box<dyn portable_pty::Child + Send + Sync>,
) -> JoinHandle<()> {
    std::thread::spawn(move || {
        let output_topic = format!("pty://output/{session_id}");
        let mut buf = [0u8; READ_BUF];
        let mut carry: Vec<u8> = Vec::new();
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let text = decode_incremental(&mut carry, &buf[..n]);
                    if !text.is_empty() {
                        let _ = app.emit(&output_topic, OutputPayload { data: text });
                    }
                }
                Err(e) if e.kind() == std::io::ErrorKind::Interrupted => continue,
                Err(_) => break,
            }
        }

        let (code, signal) = match child.wait() {
            Ok(status) => (status.exit_code() as i32, None),
            Err(_) => (-1, None),
        };
        let _ = app.emit(&format!("pty://exit/{session_id}"), ExitPayload { code, signal });
    })
}

/// Append `chunk` to `carry` and return the maximal valid-UTF-8 prefix as a
/// `String`, holding back any incomplete trailing multi-byte sequence in
/// `carry` for the next read. Genuinely invalid bytes become U+FFFD.
fn decode_incremental(carry: &mut Vec<u8>, chunk: &[u8]) -> String {
    carry.extend_from_slice(chunk);
    let mut out = String::new();
    loop {
        match std::str::from_utf8(carry) {
            Ok(s) => {
                out.push_str(s);
                carry.clear();
                break;
            }
            Err(e) => {
                let valid_up_to = e.valid_up_to();
                if valid_up_to > 0 {
                    // SAFETY: bytes up to `valid_up_to` are valid UTF-8 by definition.
                    out.push_str(unsafe { std::str::from_utf8_unchecked(&carry[..valid_up_to]) });
                }
                match e.error_len() {
                    // Incomplete trailing sequence: keep only the tail for next read.
                    None => {
                        carry.drain(..valid_up_to);
                        break;
                    }
                    // Invalid byte(s) mid-stream: emit a replacement and continue.
                    Some(bad) => {
                        out.push('\u{FFFD}');
                        carry.drain(..valid_up_to + bad);
                    }
                }
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn multibyte_split_across_reads_is_not_corrupted() {
        // "é" is 0xC3 0xA9; split it across two reads.
        let mut carry = Vec::new();
        let first = decode_incremental(&mut carry, &[b'h', 0xC3]);
        assert_eq!(first, "h");
        assert_eq!(carry, vec![0xC3], "incomplete trailing byte held back");
        let second = decode_incremental(&mut carry, &[0xA9, b'i']);
        assert_eq!(second, "éi");
        assert!(carry.is_empty());
    }

    #[test]
    fn invalid_byte_becomes_replacement() {
        let mut carry = Vec::new();
        // 0xFF is never valid UTF-8.
        let out = decode_incremental(&mut carry, &[b'a', 0xFF, b'b']);
        assert_eq!(out, "a\u{FFFD}b");
        assert!(carry.is_empty());
    }

    #[test]
    fn size_bounds_are_enforced() {
        assert!(validate_size(80, 24).is_ok());
        assert!(validate_size(1, 1).is_ok());
        assert!(validate_size(MAX_COLS, MAX_ROWS).is_ok());
        assert!(validate_size(0, 24).is_err());
        assert!(validate_size(80, 0).is_err());
        assert!(validate_size(MAX_COLS + 1, 24).is_err());
        assert!(validate_size(80, MAX_ROWS + 1).is_err());
    }

    #[test]
    fn profiles_resolve_core_side() {
        let shell = resolve_profile("shell").expect("shell profile exists");
        assert!(!shell.command.is_empty());

        let glm = resolve_profile("claude-glm").expect("glm profile exists");
        assert_eq!(glm.command, "claude");
        assert_eq!(glm.args.first().map(String::as_str), Some("--settings"));
        assert!(glm.args[1].ends_with("settings.json.glm_w"));
        assert!(!glm.args[1].contains('~'), "no literal tilde reaches the command");

        assert!(resolve_profile("does-not-exist").is_none());
    }

    // Real PTY round-trip through portable-pty's openpty/spawn/read — the same
    // underlying calls `SessionRegistry::spawn` makes, minus the AppHandle.
    // Confirms the data path works in this environment (cf. manual task 4.1).
    #[test]
    #[cfg(unix)]
    fn real_pty_round_trip_streams_output() {
        let pair = native_pty_system()
            .openpty(PtySize { rows: 24, cols: 80, pixel_width: 0, pixel_height: 0 })
            .expect("openpty");
        let mut cmd = CommandBuilder::new("bash");
        cmd.arg("-c");
        cmd.arg("printf 'PTYOK\\n'");
        for (k, v) in std::env::vars() {
            cmd.env(k, v);
        }
        let mut child = pair.slave.spawn_command(cmd).expect("spawn bash");
        drop(pair.slave);

        let mut reader = pair.master.try_clone_reader().expect("reader");
        let mut carry = Vec::new();
        let mut out = String::new();
        let mut buf = [0u8; READ_BUF];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => out.push_str(&decode_incremental(&mut carry, &buf[..n])),
                Err(_) => break,
            }
        }
        let _ = child.wait();
        assert!(out.contains("PTYOK"), "expected child output, got: {out:?}");
    }
}
