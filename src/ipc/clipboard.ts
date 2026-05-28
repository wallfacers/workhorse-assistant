import { ok, err, toIpcError, type Result } from './result';
import { isTauri } from './runtime';

/**
 * Clipboard wrappers (Tauri clipboard-manager plugin), used by the embedded
 * terminal for copy/paste. Each call no-ops with a `validation` error when
 * invoked outside a Tauri webview, so the renderer still runs in a plain
 * browser (where the terminal has no live clipboard anyway).
 */

export const writeClipboardText = async (
  text: string,
): Promise<Result<void>> => {
  if (!isTauri()) {
    return err('validation', 'clipboard invoked outside Tauri runtime');
  }
  try {
    const { writeText } = await import('@tauri-apps/plugin-clipboard-manager');
    await writeText(text);
    return ok(undefined);
  } catch (e) {
    return { ok: false, error: toIpcError(e) };
  }
};

export const readClipboardText = async (): Promise<Result<string>> => {
  if (!isTauri()) {
    return err('validation', 'clipboard invoked outside Tauri runtime');
  }
  try {
    const { readText } = await import('@tauri-apps/plugin-clipboard-manager');
    const text = await readText();
    return ok(text ?? '');
  } catch (e) {
    return { ok: false, error: toIpcError(e) };
  }
};
