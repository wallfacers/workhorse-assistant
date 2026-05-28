import { useEffect, useState } from 'react';
import { isTauri } from './runtime';

export interface WindowState {
  maximized: boolean;
  fullscreen: boolean;
}

/**
 * Tracks whether the OS window is maximized or fullscreen, kept in sync via the
 * window's resize events (so a double-click on the title bar or Win+Up updates
 * the chrome too, not just our own maximize button). Returns all-false outside
 * Tauri (plain browser), where there is no OS window to query.
 */
export function useWindowState(): WindowState {
  const [state, setState] = useState<WindowState>({
    maximized: false,
    fullscreen: false,
  });

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    void (async () => {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const w = getCurrentWindow();
      const refresh = async () => {
        const [maximized, fullscreen] = await Promise.all([
          w.isMaximized(),
          w.isFullscreen(),
        ]);
        if (!cancelled) setState({ maximized, fullscreen });
      };
      await refresh();
      const un = await w.onResized(() => void refresh());
      if (cancelled) un();
      else unlisten = un;
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  return state;
}
