import { ok, err, toIpcError, type Result } from './result';
import { isTauri } from './runtime';

/**
 * Window-control wrappers for the custom title bar.
 *
 * Each call no-ops with a `validation` error when invoked outside a Tauri
 * webview, so the same component renders harmlessly in a plain browser
 * (where the title-bar controls are hidden anyway).
 */

async function withWindow<T>(
  action: (w: import('@tauri-apps/api/window').Window) => Promise<T>,
): Promise<Result<T>> {
  if (!isTauri()) {
    return err('validation', 'window control invoked outside Tauri runtime');
  }
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const value = await action(getCurrentWindow());
    return ok(value);
  } catch (e) {
    return { ok: false, error: toIpcError(e) };
  }
}

export const minimizeWindow = (): Promise<Result<void>> =>
  withWindow((w) => w.minimize());

export const toggleMaximizeWindow = (): Promise<Result<void>> =>
  withWindow((w) => w.toggleMaximize());

export const closeWindow = (): Promise<Result<void>> =>
  withWindow((w) => w.close());

export const isWindowMaximized = (): Promise<Result<boolean>> =>
  withWindow((w) => w.isMaximized());

export const isWindowFullscreen = (): Promise<Result<boolean>> =>
  withWindow((w) => w.isFullscreen());

/** Edge/corner the user grabbed to resize a frameless window. */
export type WindowResizeDirection =
  | 'North'
  | 'South'
  | 'East'
  | 'West'
  | 'NorthEast'
  | 'NorthWest'
  | 'SouthEast'
  | 'SouthWest';

/** Hand off to the OS resize loop from a frameless edge handle. */
export const startWindowResize = (
  direction: WindowResizeDirection,
): Promise<Result<void>> =>
  withWindow((w) => w.startResizeDragging(direction));
