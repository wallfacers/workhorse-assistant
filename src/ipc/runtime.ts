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

/**
 * Whether the assistant's *host* process runs on Windows (mirrors the Rust
 * `host_is_windows` command, which returns `cfg!(windows)`). Gates the
 * `terminal`→`wsl` auto-promotion: `wsl.exe` only bridges into a distro from a
 * Windows host, so off-Windows (incl. a build running inside WSL, or browser
 * dev where there is no host) the UI keeps a local shell. The authoritative
 * backstop is `resolve_profile`'s `#[cfg(not(windows))]` fallback.
 * add-wsl-remote D-WSL-7 / C5.
 */
export async function hostIsWindows(): Promise<boolean> {
  if (!isTauri()) return false;
  const { invoke } = await import('@tauri-apps/api/core');
  try {
    return await invoke<boolean>('host_is_windows');
  } catch {
    return false;
  }
}
