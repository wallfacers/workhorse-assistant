/**
 * Native OS folder-picker dialog (Tauri plugin).
 *
 * Used by the project switcher in Native runtime mode to let the user choose a
 * project directory via the system's own file dialog instead of the in-app
 * `ProjectBrowser`.  WSL mode keeps `ProjectBrowser` because the native picker
 * cannot navigate the sidecar's POSIX namespace.
 */
import { open } from '@tauri-apps/plugin-dialog';
import { isTauri } from './runtime';
import { ok, err, type Result } from './result';

/**
 * Open a native folder-selection dialog.
 *
 * @returns The selected folder path, or `null` when the user cancels.
 *          Returns an error when not running inside Tauri.
 */
export async function pickFolder(): Promise<Result<string | null>> {
  if (!isTauri()) {
    return err('internal', 'Not in Tauri');
  }
  const selected = await open({ directory: true, multiple: false });
  // `open()` returns `string | string[] | null`.
  if (Array.isArray(selected)) return ok(selected[0] ?? null);
  return ok(selected ?? null);
}
