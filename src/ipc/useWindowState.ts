import { useEffect, useRef, useState } from 'react';
import { isTauri, isLinux } from './runtime';

export interface WindowState {
  maximized: boolean;
  fullscreen: boolean;
}

/**
 * Force a stale WSLg/webkit2gtk window surface to recomposite. Returning from
 * fullscreen/maximized to the floating, CSS-rounded state leaves the four
 * corner triangles showing the opaque pixels painted while the window filled
 * the screen — the DOM is correct (transparent corners) but the *presented*
 * surface is stale. Any genuine relayout refreshes it instantly (dragging the
 * window edge, or even opening devtools, fixes it on the spot). So we force one:
 * after a short settle, shrink the window a pixel, let webkit process the
 * relayout+repaint, then restore. The two resizes MUST be separated by a tick —
 * back-to-back calls get coalesced by the window manager into a net-zero change
 * that webkit optimises away (which is why an immediate h±1/h nudge did nothing).
 * No flicker; Linux-only, since Windows/macOS round frameless corners via the OS.
 */
async function forceCornerRepaint(
  w: import('@tauri-apps/api/window').Window,
  stillFloating: () => boolean,
): Promise<void> {
  await new Promise((r) => setTimeout(r, 120));
  // Bail if the user re-maximized/-fullscreened (or the hook unmounted) during
  // the settle wait — don't resize a now-non-floating window.
  if (!stillFloating()) return;
  try {
    const { PhysicalSize } = await import('@tauri-apps/api/dpi');
    const size = await w.outerSize();
    // 1px is the smallest delta the window manager won't round away — keeps the
    // visible reflow jump minimal while still being a genuine (non-coalesced)
    // resize once separated from the restore by a tick.
    await w.setSize(new PhysicalSize(size.width, size.height - 1));
    await new Promise((r) => setTimeout(r, 60)); // let the relayout actually land
    if (stillFloating()) await w.setSize(new PhysicalSize(size.width, size.height));
  } catch {
    // setSize/outerSize unavailable (non-desktop) — nothing else to try.
  }
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
  // Previous "floating" (restored, non-fullscreen) value, to detect the
  // non-floating→floating transition that strands opaque corners on WSLg.
  // Starts true so a window that boots floating is not treated as a transition.
  const wasFloating = useRef(true);

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    // Monotonic id guarding against out-of-order async resolution. Exiting
    // fullscreen (or restoring from maximized) fires a *burst* of `onResized`
    // events, each kicking off an async isMaximized()/isFullscreen() query over
    // IPC. Those can resolve in any order, so an earlier event's stale result
    // could land in setState *after* the final event's, leaving the state stuck
    // (dropping the floating rounded corners) — and only intermittently, since
    // it depends on IPC timing. Committing only the most-recently-fired refresh
    // makes the last event always win.
    let latest = 0;

    void (async () => {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const w = getCurrentWindow();
      const refresh = async () => {
        const seq = ++latest;
        const [maximized, fullscreen] = await Promise.all([
          w.isMaximized(),
          w.isFullscreen(),
        ]);
        // Drop this result if a newer refresh has since been fired (or the hook
        // unmounted) — its values reflect a later, more authoritative state.
        if (cancelled || seq !== latest) return;
        setState({ maximized, fullscreen });

        const floating = !maximized && !fullscreen;
        const restored = floating && !wasFloating.current;
        wasFloating.current = floating; // set before the await to guard reentrancy
        if (restored && isLinux()) {
          // Guard on the live floating state (not `seq`): our own setSize bumps
          // `latest`, but must still proceed; abort only if the hook unmounted
          // or the user re-maximized/-fullscreened during the settle wait.
          void forceCornerRepaint(w, () => !cancelled && wasFloating.current);
        }
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
