import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { ok, err, toIpcError, type Result } from './result';
import { isTauri } from './runtime';

/**
 * Typed adapter over the `pty_*` commands and `pty://…` events in
 * src-tauri/src/pty/mod.rs. Mirrors the IPC contract in ARCHITECTURE.md.
 *
 * Wrappers return `Result<T>` and never throw (see docs/FRONTEND.md). The
 * renderer passes only a `profile_id` (plus size/input) — never a command line.
 */

/** Launch profiles resolved core-side. `wsl` (add-wsl-remote C2) bridges a
 *  Windows host into a WSL distro via `wsl.exe -d <distro> --cd <path>`; it is
 *  not user-listed in the picker but is selected automatically when the sidecar
 *  reports it runs under WSL. */
export type ProfileId = 'terminal' | 'claude-opus' | 'claude-glm' | 'codex' | 'wsl';

/** Payload of `pty://output/{session_id}`. */
export interface PtyOutput {
  data: string;
}

/** Payload of `pty://exit/{session_id}`. */
export interface PtyExit {
  code: number;
  signal?: string;
}

const notInTauri = () =>
  err('validation', 'pty command invoked outside Tauri runtime');

export async function ptySpawn(
  profileId: ProfileId,
  cols?: number,
  rows?: number,
  /** Project path to root the session at. For a local sidecar it becomes the
   *  child's cwd; for a WSL sidecar (see `distro`) it is passed to
   *  `wsl.exe --cd` and ignored by host-side profiles (the path is not host-valid). */
  workdir?: string,
  /** WSL distro from `/health`; when set, the `wsl` profile targets it. */
  distro?: string,
): Promise<Result<string>> {
  if (!isTauri()) return notInTauri();
  try {
    const sessionId = await invoke<string>('pty_spawn', { profileId, cols, rows, workdir, distro });
    return ok(sessionId);
  } catch (e) {
    return { ok: false, error: toIpcError(e) };
  }
}

export async function ptyWrite(
  sessionId: string,
  data: string,
): Promise<Result<void>> {
  if (!isTauri()) return notInTauri();
  try {
    await invoke('pty_write', { sessionId, data });
    return ok(undefined);
  } catch (e) {
    return { ok: false, error: toIpcError(e) };
  }
}

export async function ptyResize(
  sessionId: string,
  cols: number,
  rows: number,
): Promise<Result<void>> {
  if (!isTauri()) return notInTauri();
  try {
    await invoke('pty_resize', { sessionId, cols, rows });
    return ok(undefined);
  } catch (e) {
    return { ok: false, error: toIpcError(e) };
  }
}

export async function ptyKill(sessionId: string): Promise<Result<void>> {
  if (!isTauri()) return notInTauri();
  try {
    await invoke('pty_kill', { sessionId });
    return ok(undefined);
  } catch (e) {
    return { ok: false, error: toIpcError(e) };
  }
}

/** Subscribe to a session's output stream. Returns the unlisten fn. */
export function onPtyOutput(
  sessionId: string,
  handler: (data: string) => void,
): Promise<UnlistenFn> {
  return listen<PtyOutput>(`pty://output/${sessionId}`, (e) => handler(e.payload.data));
}

/** Subscribe to a session's exit event. Returns the unlisten fn. */
export function onPtyExit(
  sessionId: string,
  handler: (exit: PtyExit) => void,
): Promise<UnlistenFn> {
  return listen<PtyExit>(`pty://exit/${sessionId}`, (e) => handler(e.payload));
}
