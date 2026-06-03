import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';

type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Apply extra classes to the dialog card (e.g. custom height). */
  className?: string;
  /** When false, clicking the backdrop will not close. Default `true`. */
  closeOnBackdrop?: boolean;
  /** When false, pressing Escape will not close. Default `true`. */
  closeOnEsc?: boolean;
  /** Hide the X button in the top-right corner. Default `false`. */
  hideCloseButton?: boolean;
  /** Predefined max-width. Use `className` for fine control. Default `lg`. */
  size?: ModalSize;
}

const SIZE_MAP: Record<ModalSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-2xl',
  lg: 'max-w-4xl',
  xl: 'max-w-6xl',
  full: 'max-w-[90vw]',
};

/**
 * Unified modal/dialog primitive.
 *
 * Everything privileged about the project (settings, confirmations,
 * destructive actions, secret entry) should layer on top of this component
 * so backdrop/escape/focus behavior stays consistent.
 *
 * Composition over configuration: the caller owns the inner layout. Pair
 * with arbitrary children — including the two-pane "nav + content" pattern
 * shown in the settings mock — and the modal only handles framing.
 */
export default function Modal({
  open,
  onClose,
  children,
  className = '',
  closeOnBackdrop = true,
  closeOnEsc = true,
  hideCloseButton = false,
  size = 'lg',
}: ModalProps) {
  const { t } = useTranslation();
  useEffect(() => {
    if (!open || !closeOnEsc) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, closeOnEsc, onClose]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4 bg-black/30 dark:bg-black/55 backdrop-blur-sm"
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full ${SIZE_MAP[size]} bg-surface dark:bg-surface-dark-elevated rounded-lg shadow-2xl border border-outline/60 dark:border-outline-dark overflow-hidden ${className}`}
      >
        {!hideCloseButton && (
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            title={t('common.close')}
            className="absolute top-3 right-3 z-10 p-1.5 rounded-sm text-on-surface-muted dark:text-on-canvas-dark-muted hover:text-on-surface dark:hover:text-on-canvas-dark hover:bg-surface-muted dark:hover:bg-surface-dark-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}
        {children}
      </div>
    </div>
  );
}
