import { createContext, useCallback, useContext, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { TOAST } from '../motion';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type ToastLevel = 'success' | 'info' | 'warning' | 'error';

export interface ToastOptions {
  message: string;
  level?: ToastLevel;
  /** Override auto-dismiss duration (ms). Set to 0 to disable auto-dismiss. */
  duration?: number;
}

interface ToastEntry extends Required<Pick<ToastOptions, 'message' | 'level'>> {
  id: number;
  duration: number;
}

interface ToastContextValue {
  toast: (options: ToastOptions) => void;
}

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const MAX_TOASTS = 5;
let nextId = 0;

const AUTO_DISMISS: Record<ToastLevel, number> = {
  success: 3000,
  info: 3000,
  warning: 5000,
  error: 0, // manual close only
};

const LEVEL_CONFIG: Record<ToastLevel, { icon: string; border: string }> = {
  success: { icon: '✓', border: 'border-l-success dark:border-l-success' },
  info: { icon: 'ℹ', border: 'border-l-accent-warm dark:border-l-accent-warm' },
  warning: { icon: '⚠', border: 'border-l-warning dark:border-l-warning' },
  error: { icon: '✕', border: 'border-l-danger dark:border-l-danger' },
};

/* ------------------------------------------------------------------ */
/* Context & Hook                                                      */
/* ------------------------------------------------------------------ */

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * Imperative toast hook: `toast({ message, level: 'success' })`.
 * Fire-and-forget — no return value.
 */
export function useToast(): ToastContextValue['toast'] {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx.toast;
}

/* ------------------------------------------------------------------ */
/* ToastItem                                                           */
/* ------------------------------------------------------------------ */

function ToastItem({
  entry,
  onDismiss,
}: {
  entry: ToastEntry;
  onDismiss: (id: number) => void;
}) {
  const { icon, border } = LEVEL_CONFIG[entry.level];

  return (
    <motion.div
      layout
      initial={TOAST.enter}
      animate={{ opacity: 1, x: 0 }}
      exit={TOAST.exit}
      transition={{ duration: TOAST.duration, ease: TOAST.ease }}
      className={`flex items-center gap-2 pl-3 pr-2 py-2.5 rounded-md outline outline-1 outline-outline dark:outline-outline-dark bg-surface dark:bg-surface-dark-elevated border-l-[3px] ${border} min-w-[240px] max-w-[360px]`}
    >
      <span className="text-[13px] leading-none select-none flex-shrink-0">{icon}</span>
      <span className="text-[12.5px] leading-snug text-on-surface dark:text-on-canvas-dark flex-1 break-words">
        {entry.message}
      </span>
      <button
        type="button"
        onClick={() => onDismiss(entry.id)}
        className="flex-shrink-0 p-0.5 rounded-sm text-on-surface-muted dark:text-on-canvas-dark-muted hover:text-on-surface dark:hover:text-on-canvas-dark hover:bg-surface-muted dark:hover:bg-surface-dark-muted transition-colors"
        aria-label="关闭"
      >
        <X className="w-3 h-3" />
      </button>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Provider                                                            */
/* ------------------------------------------------------------------ */

/**
 * App-level toast service. Mount once at the app root, above ConfirmProvider.
 * Renders a fixed-position container at `z-[var(--z-toast)]` (70).
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    // Clear auto-dismiss timer
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (options: ToastOptions) => {
      const id = nextId++;
      const level = options.level ?? 'info';
      const duration = options.duration ?? AUTO_DISMISS[level];

      setToasts((prev) => {
        const next = [...prev, { id, message: options.message, level, duration }];
        // Enforce cap — dismiss oldest entries beyond the max
        if (next.length > MAX_TOASTS) {
          const removed = next.splice(0, next.length - MAX_TOASTS);
          for (const r of removed) {
            const t = timersRef.current.get(r.id);
            if (t) {
              clearTimeout(t);
              timersRef.current.delete(r.id);
            }
          }
        }
        return next;
      });

      // Set auto-dismiss timer
      if (duration > 0) {
        const timer = setTimeout(() => dismiss(id), duration);
        timersRef.current.set(id, timer);
      }
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Toast container — fixed top-right */}
      <div
        aria-live="polite"
        className="fixed top-3 right-3 z-[var(--z-toast)] flex flex-col gap-2 pointer-events-none"
      >
        <AnimatePresence mode="popLayout">
          {toasts.map((entry) => (
            <div key={entry.id} className="pointer-events-auto">
              <ToastItem entry={entry} onDismiss={dismiss} />
            </div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
