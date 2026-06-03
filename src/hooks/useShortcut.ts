import { useEffect, useRef } from 'react';
import { useShortcutContext } from '../shortcuts/ShortcutProvider';
import type { ShortcutAction } from '../shortcuts/types';

/**
 * Register a global keyboard shortcut handler.
 *
 * The handler is registered on mount and unregistered on unmount. When `deps`
 * are provided, the registration is re-created when any dep changes (so the
 * closure captures the latest values).
 *
 * @example
 * ```ts
 * useShortcut('splitTerminal', () => dispatch({ type: 'splitPane', ... }), [state]);
 * ```
 */
export function useShortcut(
  action: ShortcutAction,
  handler: () => void,
  deps: unknown[] = [],
): void {
  const { registerShortcut } = useShortcutContext();

  // Stable ref for the handler so registerShortcut doesn't need handler in deps.
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const unregister = registerShortcut(action, () => handlerRef.current());
    return unregister;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, registerShortcut, ...deps]);
}

/**
 * Push an Escape handler onto the shared LIFO stack.
 *
 * When `enabled` is false (default true), the handler is not pushed. This is
 * the standard way for modals to register Escape-to-close.
 *
 * @example
 * ```ts
 * useEscape(onClose, open && closeOnEsc);
 * ```
 */
export function useEscape(
  handler: () => void,
  enabled: boolean = true,
): void {
  const { pushEscape, popEscape } = useShortcutContext();
  const idRef = useRef<symbol | null>(null);

  useEffect(() => {
    if (enabled) {
      const id = pushEscape(handler);
      idRef.current = id;
      return () => {
        popEscape(id);
        idRef.current = null;
      };
    } else {
      if (idRef.current !== null) {
        popEscape(idRef.current);
        idRef.current = null;
      }
    }
  }, [enabled, handler, pushEscape, popEscape]);
}
