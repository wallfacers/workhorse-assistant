import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { isMac } from './platform';
import {
  cloneConfig,
  DEFAULT_SHORTCUTS,
  matchBinding,
  STORAGE_KEY,
  type KeyBinding,
  type ShortcutAction,
  type ShortcutConfig,
} from './types';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface ShortcutContextValue {
  shortcuts: ShortcutConfig;
  setShortcuts: (c: ShortcutConfig) => void;
  isMacPlatform: boolean;
  /** Register a handler for an action. Returns a function to unregister. */
  registerShortcut: (action: ShortcutAction, handler: () => void) => () => void;
  /** Push an escape handler onto the LIFO stack. Returns its unique id. */
  pushEscape: (handler: () => void) => symbol;
  /** Pop an escape handler by id (no-op if not on top or not found). */
  popEscape: (id: symbol) => void;
}

const ShortcutContext = createContext<ShortcutContextValue | null>(null);

export function useShortcutContext(): ShortcutContextValue {
  const ctx = useContext(ShortcutContext);
  if (!ctx) throw new Error('useShortcutContext must be used within ShortcutProvider');
  return ctx;
}

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

function loadConfig(): ShortcutConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneConfig(DEFAULT_SHORTCUTS);
    const overrides = JSON.parse(raw) as Partial<Record<ShortcutAction, KeyBinding>>;
    return {
      bindings: { ...DEFAULT_SHORTCUTS.bindings, ...overrides },
    };
  } catch {
    return cloneConfig(DEFAULT_SHORTCUTS);
  }
}

function persistConfig(config: ShortcutConfig): void {
  try {
    const overrides: Partial<Record<ShortcutAction, KeyBinding>> = {};
    for (const action of Object.keys(config.bindings) as ShortcutAction[]) {
      const binding = config.bindings[action];
      const def = DEFAULT_SHORTCUTS.bindings[action];
      if (
        !def ||
        binding.mod !== def.mod ||
        binding.alt !== def.alt ||
        binding.shift !== def.shift ||
        binding.code !== def.code
      ) {
        overrides[action] = binding;
      }
    }
    if (Object.keys(overrides).length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // localStorage unavailable — preference stays in-memory
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface Props {
  children: ReactNode;
}

export default function ShortcutProvider({ children }: Props) {
  const [shortcuts, setShortcutsState] = useState<ShortcutConfig>(loadConfig);
  const macRef = useRef(isMac());

  // The handler registry. We use refs so the keydown listener always reads the
  // latest handlers without re-registering the window listener on every change.
  const handlerRef = useRef<Map<ShortcutAction, () => void>>(new Map());

  // Escape stack: array of { id: symbol, handler: () => void }.
  const escapeStackRef = useRef<Array<{ id: symbol; handler: () => void }>>([]);

  // Keep the config in a ref so the keydown listener reads the latest bindings
  // without depending on `shortcuts` state (avoids re-registering the listener).
  const configRef = useRef(shortcuts);
  configRef.current = shortcuts;

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  const setShortcuts = useCallback((c: ShortcutConfig) => {
    setShortcutsState(c);
    persistConfig(c);
  }, []);

  const registerShortcut = useCallback(
    (action: ShortcutAction, handler: () => void): (() => void) => {
      handlerRef.current.set(action, handler);
      return () => {
        if (handlerRef.current.get(action) === handler) {
          handlerRef.current.delete(action);
        }
      };
    },
    [],
  );

  const pushEscape = useCallback((handler: () => void): symbol => {
    const id = Symbol('escape');
    escapeStackRef.current.push({ id, handler });
    return id;
  }, []);

  const popEscape = useCallback((id: symbol): void => {
    const stack = escapeStackRef.current;
    const idx = stack.findIndex((entry) => entry.id === id);
    if (idx !== -1) stack.splice(idx, 1);
  }, []);

  // -----------------------------------------------------------------------
  // Global keydown listener
  // -----------------------------------------------------------------------

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Never intercept during IME composition.
      if (e.isComposing) return;

      // Escape: LIFO stack.
      if (e.code === 'Escape' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        const stack = escapeStackRef.current;
        if (stack.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          // Copy: the handler might mutate the stack (e.g. calling onClose which
          // pops itself), so grab the top before invoking.
          const top = stack[stack.length - 1];
          top.handler();
        }
        return;
      }

      // Match against the registry.
      const mac = macRef.current;
      const config = configRef.current;
      for (const [action, handler] of handlerRef.current) {
        const binding = config.bindings[action];
        if (!binding) continue;

        // cancelClose (Escape) is handled above, not via regular matching.
        if (action === 'cancelClose') continue;

        if (matchBinding(e, binding, mac)) {
          e.preventDefault();
          e.stopPropagation();
          handler();
          return; // first match wins
        }
      }
    }

    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, []);

  // -----------------------------------------------------------------------
  // Context value
  // -----------------------------------------------------------------------

  const value: ShortcutContextValue = {
    shortcuts,
    setShortcuts,
    isMacPlatform: macRef.current,
    registerShortcut,
    pushEscape,
    popEscape,
  };

  return (
    <ShortcutContext.Provider value={value}>
      {children}
    </ShortcutContext.Provider>
  );
}
