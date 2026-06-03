import { useState, useRef, useCallback, type ReactNode } from 'react';

/**
 * Simple custom tooltip — replaces the native `title` attribute with a styled
 * hover popover. Uses a small delay before showing to avoid flickering.
 * Renders below the trigger so it is not clipped by ancestor overflow.
 * The `min-w-0` on the wrapper lets inner `truncate` work inside flex layouts.
 *
 * When `overflowOnly` is true the tooltip only appears if the first child
 * element has text that is actually clipped (overflow !== visible).
 */
export default function Tooltip({
  content,
  children,
  overflowOnly = false,
}: {
  content: string;
  children: ReactNode;
  /** Only show tooltip when the child text is actually truncated. */
  overflowOnly?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLSpanElement>(null);

  const isOverflowing = useCallback(() => {
    if (!overflowOnly || !wrapperRef.current) return true;
    const el = wrapperRef.current.firstElementChild as HTMLElement | null;
    if (!el) return true;
    return el.scrollWidth > el.clientWidth;
  }, [overflowOnly]);

  const show = () => {
    timerRef.current = setTimeout(() => {
      if (isOverflowing()) setVisible(true);
    }, 400);
  };
  const hide = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setVisible(false);
  };

  return (
    <span ref={wrapperRef} className="relative inline-block min-w-0" onMouseEnter={show} onMouseLeave={hide}>
      {children}
      {visible && (
        <span className="pointer-events-none absolute left-1/2 top-full z-[9999] mt-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-surface-dark-elevated px-2 py-1 text-[11px] leading-relaxed text-white shadow-lg dark:bg-surface dark:text-on-surface">
          {content}
        </span>
      )}
    </span>
  );
}
