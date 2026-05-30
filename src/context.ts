import { createContext, useContext } from 'react';
import type { AgentConnection } from './ipc';

// ---------------------------------------------------------------------------
// AppContext — global app state consumed throughout the tree.
// Replaces the former DarkModeCtx and the prop-drilling chain
// App → AgentRail → SettingsModal.
// ---------------------------------------------------------------------------

export interface AppContextValue {
  isDarkMode: boolean;
  setIsDarkMode: (dark: boolean) => void;
  autoExpandReasoning: boolean;
  setAutoExpandReasoning: (v: boolean) => void;
  agent: AgentConnection;
}

export const AppContext = createContext<AppContextValue | null>(null);

/** Convenience hook — throws if used outside <AppContext.Provider>. */
export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within <AppContext.Provider>');
  return ctx;
}
