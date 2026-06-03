import { createContext, useCallback, useContext, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { CheckCircle2, CircleX, Info, TriangleAlert, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
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

/**
 * Per-level visual config. All Tailwind classes are written out in full (no
 * `bg-${level}` interpolation) so the v4 scanner keeps them. Each level pairs a
 * lucide icon with a tint fill (`bg-x/10`), a hairline border (`border-x/30`),
 * and a matching icon color — the tint is the level signal; the body copy stays
 * neutral ink. Tints survive dark mode since the semantic tokens are role-fixed.
 */
const LEVEL_CONFIG: Record<
  ToastLevel,
  { Icon: LucideIcon; tint: string; border: string; iconColor: string }
> = {
  success: {
    Icon: CheckCircle2,
    tint: 'bg-success/10',
    border: 'border-success/30',
    iconColor: 'text-success',
  },
  info: {
    Icon: Info,
    tint: 'bg-accent-warm/10',
    border: 'border-accent-warm/30',
    iconColor: 'text-accent-warm',
  },
  warning: {
    Icon: TriangleAlert,
    tint: 'bg-warning/10',
    border: 'border-warning/30',
    iconColor: 'text-warning',
  },
  error: {
    Icon: CircleX,
    tint: 'bg-danger/10',
    border: 'border-danger/30',
    iconColor: 'text-danger',
  },
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
  const { t } = useTranslation();
  const { Icon, tint, border, iconColor } = LEVEL_CONFIG[entry.level];

  return (
    <motion.div
      layout
      initial={TOAST.enter}
      animate={{ opacity: 1, x: 0 }}
      exit={TOAST.exit}
      transition={{ duration: TOAST.duration, ease: TOAST.ease }}
      className={`relative overflow-hidden flex items-center gap-2.5 pl-3 pr-2 py-2.5 rounded-lg border ${border} bg-surface dark:bg-surface-dark-elevated min-w-[240px] max-w-[360px]`}
    >
      {/* Level tint — sits over the opaque card so the toast stays readable
          against whatever app content is behind it. */}
      <div className={`absolute inset-0 pointer-events-none ${tint}`} aria-hidden="true" />
      <Icon className={`relative w-4 h-4 flex-shrink-0 ${iconColor}`} aria-hidden="true" />
      <span className="relative text-[13px] leading-snug text-on-surface dark:text-on-canvas-dark flex-1 break-words">
        {entry.message}
      </span>
      <button
        type="button"
        onClick={() => onDismiss(entry.id)}
        className="relative flex-shrink-0 p-0.5 rounded-sm text-on-surface-muted dark:text-on-canvas-dark-muted hover:text-on-surface dark:hover:text-on-canvas-dark hover:bg-surface-muted dark:hover:bg-surface-dark-muted transition-colors"
        aria-label={t('common.close')}
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
