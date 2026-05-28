import { useContext, useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import {
  ptySpawn,
  ptyWrite,
  ptyResize,
  ptyKill,
  onPtyOutput,
  onPtyExit,
  type ProfileId,
} from '../ipc';
import { DarkModeCtx } from '../App';

const RESIZE_DEBOUNCE_MS = 80;

// xterm v6 renders its own Monaco-style DOM scrollbar (`.xterm-scrollable-element
// > .scrollbar > .slider`), not a native one — so `::-webkit-scrollbar` /
// `scrollbar-width` never reach it. The slider colour comes from these theme
// tokens (matching the project `custom-scrollbar` palette); its 6px width and
// radius are set in index.css.
const SCROLLBAR_LIGHT = {
  scrollbarSliderBackground: '#d1d5db',
  scrollbarSliderHoverBackground: '#9ca3af',
  scrollbarSliderActiveBackground: '#9ca3af',
};
const SCROLLBAR_DARK = {
  scrollbarSliderBackground: '#525252',
  scrollbarSliderHoverBackground: '#737373',
  scrollbarSliderActiveBackground: '#737373',
};

const DARK_THEME = {
  background: '#161618',
  foreground: '#eceff2',
  cursor: '#0b6477',
  selectionBackground: '#0b647755',
  ...SCROLLBAR_DARK,
};

const LIGHT_THEME = {
  background: '#f4f6f8',
  foreground: '#101012',
  cursor: '#0b6477',
  cursorAccent: '#f4f6f8',
  selectionBackground: '#0b647733',
  // ANSI palette tuned for a light background: xterm's default yellows and
  // whites are near-invisible on light, so they're darkened to readable,
  // maritime-leaning tones (e.g. `ls`/`dir` directory yellow → dark amber).
  black: '#1b1f24',
  red: '#b81e1e',
  green: '#1f7a5a',
  yellow: '#8a5a00',
  blue: '#144272',
  magenta: '#7b3fb8',
  cyan: '#0b6477',
  white: '#5b6470',
  brightBlack: '#6e7781',
  brightRed: '#cf3030',
  brightGreen: '#2a8f6a',
  brightYellow: '#9a6a00',
  brightBlue: '#1f5aa0',
  brightMagenta: '#8f51c8',
  brightCyan: '#0e7d92',
  brightWhite: '#1b1f24',
  ...SCROLLBAR_LIGHT,
};

interface TerminalProps {
  profileId: ProfileId;
  onTitle?: (title: string) => void;
}

/**
 * A single embedded PTY session rendered with xterm.js. Fills its parent.
 * Spawns the launch profile, streams output in, forwards keystrokes out,
 * keeps the PTY sized to the viewport, and tears the child down on unmount.
 */
export default function Terminal({ profileId, onTitle }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const isDark = useContext(DarkModeCtx);

  // Sync xterm theme when dark mode changes.
  // xterm.css defaults .xterm-viewport to #000; we must force the viewport
  // background explicitly because xterm's internal theme-to-style sync can
  // lag or miss updates.
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    const theme = isDark ? DARK_THEME : LIGHT_THEME;
    term.options.theme = theme;
    const vp = containerRef.current?.querySelector('.xterm-viewport') as HTMLElement | null;
    if (vp) vp.style.backgroundColor = theme.background;
  }, [isDark]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let sessionId: string | null = null;
    let unlistenOutput: (() => void) | null = null;
    let unlistenExit: (() => void) | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let resizeTimer: number | undefined;

    const term = new XTerm({
      fontFamily:
        'ui-monospace, SFMono-Regular, "JetBrains Mono", Consolas, monospace',
      fontSize: 13,
      cursorBlink: true,
      theme: isDark ? DARK_THEME : LIGHT_THEME,
    });
    termRef.current = term;
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);
    // Force viewport background on first paint (xterm.css defaults to #000).
    const vp = container.querySelector('.xterm-viewport') as HTMLElement | null;
    if (vp) vp.style.backgroundColor = (isDark ? DARK_THEME : LIGHT_THEME).background;
    // Defensive (design D4): a pane mounted inside a hidden group has a 0×0
    // container; fitting it would throw or set 0 cols/rows. Skip the initial
    // fit and let the core use its 80×24 default; the ResizeObserver refits
    // once the group is shown.
    const hasSize =
      container.clientWidth > 0 && container.clientHeight > 0;
    if (hasSize) fit.fit();

    void (async () => {
      const spawned = hasSize
        ? await ptySpawn(profileId, term.cols, term.rows)
        : await ptySpawn(profileId);
      if (!spawned.ok) {
        // Render the failure inline rather than leaving a blank pane.
        term.writeln(`\x1b[31mFailed to start "${profileId}": ${spawned.error.message}\x1b[0m`);
        if (spawned.error.kind === 'validation') {
          term.writeln(
            '\x1b[90m(Embedded terminals need the desktop app — run `npm run tauri:dev`.)\x1b[0m',
          );
        }
        return;
      }
      // Unmounted while spawn was in flight: kill the orphan and bail.
      if (disposed) {
        await ptyKill(spawned.value);
        return;
      }
      sessionId = spawned.value;

      unlistenOutput = await onPtyOutput(sessionId, (data) => term.write(data));
      unlistenExit = await onPtyExit(sessionId, ({ code, signal }) => {
        const how = signal ? `signal ${signal}` : `code ${code}`;
        term.writeln(`\r\n\x1b[90m[process exited with ${how}]\x1b[0m`);
      });
      // Unmounted while listeners were attaching.
      if (disposed) {
        unlistenOutput?.();
        unlistenExit?.();
        await ptyKill(sessionId);
        return;
      }

      term.onData((data) => {
        if (sessionId) void ptyWrite(sessionId, data);
      });

      term.onTitleChange((title) => onTitle?.(title));

      resizeObserver = new ResizeObserver(() => {
        window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(() => {
          // Guard before fit (design D4): fitting a 0×0 container (e.g. a
          // hidden group) can throw or set 0 cols/rows and would emit a
          // rejected pty_resize(0,…). Bail until the container has size again.
          if (container.clientWidth === 0 || container.clientHeight === 0) return;
          fit.fit();
          if (sessionId) void ptyResize(sessionId, term.cols, term.rows);
        }, RESIZE_DEBOUNCE_MS);
      });
      resizeObserver.observe(container);
    })();

    return () => {
      disposed = true;
      window.clearTimeout(resizeTimer);
      resizeObserver?.disconnect();
      // Teardown order (design D10): detach listeners, kill the child, then
      // dispose — so output never lands on a destroyed terminal.
      unlistenOutput?.();
      unlistenExit?.();
      const sid = sessionId;
      void (async () => {
        if (sid) await ptyKill(sid);
        term.dispose();
      })();
    };
  }, [profileId]);

  return (
    <div className="h-full w-full bg-surface-muted dark:bg-surface-dark overflow-hidden p-2">
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
