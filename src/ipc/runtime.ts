/**
 * Runtime environment detection.
 *
 * Tauri v2 injects `__TAURI_INTERNALS__` into `window` very early during
 * webview boot. Anything that depends on the Rust core (window controls,
 * file system, secret storage) MUST gate on `isTauri()` so the renderer
 * also runs as a plain browser app for fast UI iteration via `npm run dev`.
 */
export function isTauri(): boolean {
  return (
    typeof window !== 'undefined' &&
    Object.prototype.hasOwnProperty.call(window, '__TAURI_INTERNALS__')
  );
}
