import { useState, useRef, type ReactNode } from 'react';

/**
 * Simple custom tooltip — replaces the native `title` attribute with a styled
 * hover popover. Uses a small delay before showing to avoid flickering.
 * Renders below the trigger so it is not clipped by ancestor overflow.
 * The `min-w-0` on the wrapper lets inner `truncate` work inside flex layouts.
 */
export default function Tooltip({
  content,
  children,
}: {
  content: string;
  children: ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = () => {
    timerRef.current = setTimeout(() => setVisible(true), 400);
  };
  const hide = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setVisible(false);
  };

  return (
    <span className="relative inline-block min-w-0" onMouseEnter={show} onMouseLeave={hide}>
      {children}
      {visible && (
        <span className="pointer-events-none absolute left-1/2 top-full z-[9999] mt-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-surface-dark-elevated px-2 py-1 text-[11px] leading-relaxed text-white shadow-lg dark:bg-surface dark:text-on-surface">
          {content}
        </span>
      )}
    </span>
  );
}
