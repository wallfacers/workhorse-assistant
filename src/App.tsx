import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PanelRightOpen } from 'lucide-react';
import { Group, Panel, Separator } from 'react-resizable-panels';
import AgentRail from './components/AgentRail';
import ErrorBoundary from './components/ErrorBoundary';
import TerminalWorkspace from './components/terminal/TerminalWorkspace';
import RightPanel from './components/RightPanel';
import TitleBar from './components/TitleBar';
import WindowResizeHandles from './components/WindowResizeHandles';
import { isTauri, useWindowState, useAgentConnection } from './ipc';
import { registerFallbackTools, republishCatalog } from './agent';
import { AppContext } from './context';
import { SessionProvider } from './session/SessionProvider';

export default function App() {
  const { t } = useTranslation();
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
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
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

  const appContextValue = {
    isDarkMode,
    setIsDarkMode,
    autoExpandReasoning,
    setAutoExpandReasoning,
    agent,
  };

  return (
    <AppContext value={appContextValue}>
    <SessionProvider agent={agent}>
    <div
      className={`${isDarkMode ? 'dark' : ''} ${floating ? 'rounded-xl border border-outline dark:border-outline-dark' : ''} relative h-screen w-screen flex flex-col overflow-hidden bg-surface-muted dark:bg-surface-dark text-on-canvas dark:text-on-canvas-dark font-sans`}
    >
      <TitleBar maximized={maximized} />

      <div className="flex-1 min-h-0 w-full flex p-3.5 overflow-hidden">
        <Group
          id="main-layout"
          orientation="horizontal"
          className="flex-1 min-h-0"
        >
          <Panel id="chat-panel" defaultSize="400px" minSize="280px" maxSize="50%">
            <div className="h-full pr-1">
              <ErrorBoundary name="Chat">
                <AgentRail />
              </ErrorBoundary>
            </div>
          </Panel>
          <Separator className="separator-handle" />
          <Panel id="terminal-panel" minSize="30%">
            <div className="h-full pl-1">
              <ErrorBoundary name="Terminal">
                <TerminalWorkspace />
              </ErrorBoundary>
            </div>
          </Panel>
        </Group>

        {rightPanelOpen ? (
          <RightPanel onClose={() => setRightPanelOpen(false)} />
        ) : (
          <div className="flex-shrink-0 flex items-start pt-4 px-1">
            <button
              type="button"
              data-testid="open-work-panel"
              data-agent-clickable
              onClick={() => setRightPanelOpen(true)}
              aria-label={t('workspace.expandPanel')}
              title={t('workspace.expandPanel')}
              className="p-1.5 rounded-sm text-on-surface-muted dark:text-on-canvas-dark-muted hover:bg-canvas/70 dark:hover:bg-surface-dark-muted hover:text-on-surface dark:hover:text-on-canvas-dark transition-colors"
            >
              <PanelRightOpen className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

    </div>
    {floating && <WindowResizeHandles />}
    </SessionProvider>
    </AppContext>
  );
}
