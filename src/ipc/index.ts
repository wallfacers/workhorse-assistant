/**
 * Single entry point for renderer ↔ core IPC.
 *
 * Rules (see docs/FRONTEND.md):
 *   1. Components import from `@/src/ipc` only. Never call `invoke()` directly.
 *   2. Every command gets a typed wrapper in `<domain>.ts` and is re-exported here.
 *   3. Wrappers return `Result<T>`; they never throw.
 */

export type { AppInfo } from './app';
export { getAppInfo, greet } from './app';
export type { IpcError, IpcErrorKind, Result } from './result';
export { ok, err } from './result';
export { isTauri } from './runtime';
export { writeClipboardText, readClipboardText } from './clipboard';
export {
  minimizeWindow,
  toggleMaximizeWindow,
  closeWindow,
  isWindowMaximized,
  isWindowFullscreen,
  startWindowResize,
} from './window';
export type { WindowResizeDirection } from './window';
export { useWindowState } from './useWindowState';
export type { WindowState } from './useWindowState';
export type { ProfileId, PtyOutput, PtyExit } from './pty';
export {
  ptySpawn,
  ptyWrite,
  ptyResize,
  ptyKill,
  onPtyOutput,
  onPtyExit,
} from './pty';
export { attachAgentSession, detachAgentSession } from './agent';
export { useAgentConnection } from './useAgentConnection';
export type { AgentStatus, AgentConnection } from './useAgentConnection';
