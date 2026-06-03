import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PanelRightOpen } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
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
import { ConfirmProvider } from './components/ConfirmProvider';
import { ToastProvider } from './components/ToastProvider';
import { SessionProvider } from './session/SessionProvider';
import { ShortcutProvider, useShortcut } from './shortcuts';
import { PANEL, FADE } from './motion';

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
  // File-open queue: RightPanel pushes a path, TerminalWorkspace consumes it.
  const [pendingFile, setPendingFile] = useState<string | null>(null);
  const handleOpenFile = useCallback((filePath: string) => setPendingFile(filePath), []);
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
    <ShortcutProvider>
    <SessionProvider agent={agent}>
    <ToastProvider>
    <ConfirmProvider>
    <AppShortcuts
      rightPanelOpen={rightPanelOpen}
      setRightPanelOpen={setRightPanelOpen}
    />
    <div
      className={`${isDarkMode ? 'dark' : ''} ${floating ? 'rounded-xl border border-outline dark:border-outline-dark' : ''} relative h-screen w-screen flex flex-col overflow-hidden bg-surface-muted dark:bg-surface-dark text-on-canvas dark:text-on-canvas-dark font-sans`}
    >
      <TitleBar maximized={maximized} />

      {/* TEMP DEBUG OVERLAY — corner-rounding diagnosis. Remove after. */}
      <div
        style={{
          position: 'fixed',
          top: 4,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 99999,
          background: 'rgba(0,0,0,0.85)',
          color: '#39ff14',
          font: '11px monospace',
          padding: '2px 10px',
          borderRadius: 4,
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        {`tauri=${String(tauri)}  max=${String(maximized)}  fs=${String(fullscreen)}  floating=${String(floating)}`}
      </div>

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
                <TerminalWorkspace pendingFile={pendingFile} onFileConsumed={() => setPendingFile(null)} />
              </ErrorBoundary>
            </div>
          </Panel>
        </Group>

        {/* Right panel (工作台) — animated open/close.
            Uses opacity + translateX (GPU-only) instead of width to avoid
            layout thrashing on low-GPU environments (WSL2, remote desktop). */}
        <AnimatePresence>
          {rightPanelOpen && (
            <motion.div
              key="right-panel"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 40 }}
              transition={{ duration: PANEL.duration, ease: PANEL.ease }}
              className="flex-shrink-0"
            >
              <RightPanel onClose={() => setRightPanelOpen(false)} onOpenFile={handleOpenFile} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Open button — always mounted, opacity-toggled (design D4) */}
        <motion.div
          animate={{ opacity: rightPanelOpen ? 0 : 1 }}
          transition={{ duration: FADE.duration, ease: FADE.ease }}
          className="flex-shrink-0 flex items-start pt-4 px-1"
          style={{ pointerEvents: rightPanelOpen ? 'none' : 'auto' }}
        >
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
        </motion.div>
      </div>

    </div>
    {floating && <WindowResizeHandles />}
    </ConfirmProvider>
    </ToastProvider>
    </SessionProvider>
    </ShortcutProvider>
    </AppContext>
  );
}

/** Small inner component that wires App-level shortcuts. Lives inside ShortcutProvider. */
function AppShortcuts({
  rightPanelOpen,
  setRightPanelOpen,
}: {
  rightPanelOpen: boolean;
  setRightPanelOpen: (v: boolean) => void;
}) {
  useShortcut('toggleSidebar', () => setRightPanelOpen(!rightPanelOpen), [
    rightPanelOpen,
    setRightPanelOpen,
  ]);
  return null;
}
