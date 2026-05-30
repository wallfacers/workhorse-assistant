import { createContext, useEffect, useState } from 'react';
import { PanelRightOpen } from 'lucide-react';
import AgentRail from './components/AgentRail';
import TerminalWorkspace from './components/terminal/TerminalWorkspace';
import RightPanel from './components/RightPanel';
import TitleBar from './components/TitleBar';
import WindowResizeHandles from './components/WindowResizeHandles';
import { isTauri, useWindowState, useAgentConnection } from './ipc';
import { registerFallbackTools, republishCatalog } from './agent';

export const DarkModeCtx = createContext(false);

export default function App() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  // Display-only preference: auto-expand the reasoning ("thinking") section while
  // it streams. Persisted across sessions; does NOT enable/disable thinking
  // (that is the sidecar's config). Defaults collapsed.
  const [autoExpandReasoning, setAutoExpandReasoning] = useState<boolean>(() => {
    try {
      return localStorage.getItem('workhorse:autoExpandReasoning') === 'true';
    } catch {
      return false;
    }
  });
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const tauri = isTauri();
  const { maximized, fullscreen } = useWindowState();
  const agent = useAgentConnection();

  // Frameless window: rounded with a hairline border while floating; flush and
  // square when the OS has it maximized/fullscreen (or in a plain browser).
  // The window is transparent, so the area outside the root's radius reveals
  // the desktop — i.e. real rounded corners with no gradient frame.
  // Opaque frameless window: rounded corners come from the OS (Windows 11 DWM
  // rounds top-level windows), so the renderer keeps the root square — an
  // opaque window would otherwise show square corners beyond a CSS radius.
  // Resize grips show only while floating (maximized/fullscreen have OS edges).
  const floating = tauri && !maximized && !fullscreen;

  // Drive Tailwind dark mode at the document root so every element — including
  // any detached/portal'd subtree — sits under the `.dark` ancestor that the
  // `dark:` variant keys off (`@custom-variant dark (&:is(.dark *))`).
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
  }, [isDarkMode]);

  // Persist the reasoning display preference across sessions.
  useEffect(() => {
    try {
      localStorage.setItem('workhorse:autoExpandReasoning', String(autoExpandReasoning));
    } catch {
      // localStorage unavailable (private mode / sandbox) — preference stays
      // in-memory for this session only.
    }
  }, [autoExpandReasoning]);

  // Register the generic data-testid fallback tools once for the app lifetime
  // (task 2.6). Components register their semantic tools separately.
  useEffect(() => {
    const unregister = registerFallbackTools();
    void republishCatalog();
    return () => {
      unregister();
      void republishCatalog();
    };
  }, []);

  return (
    <DarkModeCtx value={isDarkMode}>
    <div
      className={`${isDarkMode ? 'dark' : ''} ${floating ? 'rounded-xl border border-outline dark:border-neutral-800' : ''} relative h-screen w-screen flex flex-col overflow-hidden bg-surface-muted dark:bg-surface-dark text-on-canvas dark:text-on-canvas-dark font-sans`}
    >
      <TitleBar maximized={maximized} />

      <div className="flex-1 min-h-0 w-full flex p-3.5 gap-3.5 overflow-hidden">
        <AgentRail
          isDarkMode={isDarkMode}
          setIsDarkMode={setIsDarkMode}
          agent={agent}
          autoExpandReasoning={autoExpandReasoning}
          setAutoExpandReasoning={setAutoExpandReasoning}
        />
        <div className="flex-1 min-w-0 h-full flex flex-col overflow-hidden">
          <TerminalWorkspace />
        </div>
        {rightPanelOpen ? (
          <RightPanel onClose={() => setRightPanelOpen(false)} />
        ) : (
          <div className="flex-shrink-0 flex items-start pt-4 px-1">
            <button
              type="button"
              data-testid="open-work-panel"
              data-agent-clickable
              onClick={() => setRightPanelOpen(true)}
              aria-label="Open work panel"
              title="展开工作台"
              className="p-1.5 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-200/70 dark:hover:bg-neutral-800 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
            >
              <PanelRightOpen className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

    </div>
    {floating && <WindowResizeHandles />}
    </DarkModeCtx>
  );
}
