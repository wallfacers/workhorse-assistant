import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useEscape } from '../shortcuts';

/**
 * Options for a single confirmation. `body` accepts a ReactNode so callers can
 * pass rich content (counts, paths in <code>, an "irreversible" warning line).
 */
export interface ConfirmOptions {
  title: string;
  body?: ReactNode;
  /** Render the confirm button in the danger (red) tone. */
  danger?: boolean;
  confirmText?: string;
  cancelText?: string;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * Imperative confirmation hook: `const ok = await confirm({ title, body, danger })`.
 *
 * Inject this at UI interaction handlers ONLY — never inside shared mutation
 * helpers — so PTY close and agent/MCP tool calls (which go straight through the
 * helpers) are never gated by the human dialog.
 */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within <ConfirmProvider>');
  return ctx;
}

interface Pending extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

/**
 * App-level confirmation service. Mount once at the app root. Renders a single
 * dialog above all modals (`--z-confirm` › `--z-modal`, see DESIGN.md › Stacking).
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [pending, setPending] = useState<Pending | null>(null);
  // Guard against double-settle (Enter + click) resolving the same promise twice.
  const settledRef = useRef(false);

  const confirm = useCallback<ConfirmFn>(
    (opts) =>
      new Promise<boolean>((resolve) => {
        setPending((prev) => {
          // A second confirm() while one is still open supersedes it: cancel the
          // previous promise (resolve false) so its awaiter never hangs forever.
          // Promise resolution is idempotent, so a StrictMode double-invoke of
          // this updater is harmless.
          prev?.resolve(false);
          settledRef.current = false;
          return { ...opts, resolve };
        });
      }),
    [],
  );

  const settle = useCallback((value: boolean) => {
    setPending((p) => {
      if (p && !settledRef.current) {
        settledRef.current = true;
        p.resolve(value);
      }
      return null;
    });
  }, []);

  // Escape cancels via centralized stack; Enter confirms. Lock background scroll while open.
  useEscape(() => settle(false), !!pending);

  useEffect(() => {
    if (!pending) return;
    const handler = (e: KeyboardEvent) => {
      if (e.isComposing) return;
      if (e.key === 'Enter') settle(true);
    };
    window.addEventListener('keydown', handler);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handler);
      document.body.style.overflow = prevOverflow;
    };
  }, [pending, settle]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[var(--z-confirm)] flex items-center justify-center p-4 bg-black/40 dark:bg-black/55"
          onClick={() => settle(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-surface dark:bg-surface-dark-elevated rounded-lg border border-outline dark:border-outline-dark shadow-[0_16px_48px_rgba(0,0,0,0.15)] p-5"
          >
            <h2 className="text-[14px] font-semibold text-on-surface dark:text-on-canvas-dark">
              {pending.title}
            </h2>
            {pending.body != null && (
              <div className="mt-2 text-[12.5px] leading-relaxed text-on-surface-muted dark:text-on-canvas-dark-muted">
                {pending.body}
              </div>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => settle(false)}
                className="rounded-md px-3 py-1.5 text-[12.5px] font-medium text-on-surface-muted dark:text-on-canvas-dark-muted hover:bg-surface-muted dark:hover:bg-surface-dark-muted transition-colors"
              >
                {pending.cancelText ?? t('common.cancel')}
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => settle(true)}
                className={`rounded-md px-3 py-1.5 text-[12.5px] font-medium text-white transition-colors ${
                  pending.danger ? 'bg-danger hover:bg-danger/90' : 'bg-primary hover:bg-primary/90'
                }`}
              >
                {pending.confirmText ?? t('common.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
