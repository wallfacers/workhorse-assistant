import { Minus, Square, X, Copy as CopyIcon } from 'lucide-react';
import {
  isTauri,
  minimizeWindow,
  toggleMaximizeWindow,
  closeWindow,
} from '../ipc';

interface TitleBarProps {
  /** Synced maximize state (owned by App via useWindowState). */
  maximized: boolean;
}

/**
 * Frameless top title bar.
 *
 * Only renders in Tauri mode. Shows a drag region with the OS window
 * controls (`[─][□][×]`) on the right. Browser mode returns null. The
 * `maximized` state is driven by the window's resize events (see
 * useWindowState) so a system maximize (title-bar double-click, Win+Up)
 * updates the restore icon too.
 */
export default function TitleBar({ maximized }: TitleBarProps) {
  if (!isTauri()) return null;

  const handleToggleMax = () => void toggleMaximizeWindow();

  return (
    <div className="bg-surface-muted dark:bg-surface-dark select-none flex-shrink-0">
      <div
        data-tauri-drag-region
        className="h-8 flex items-center justify-end px-2 gap-1 text-gray-500 dark:text-gray-400"
      >
        <WindowButton
          label="Minimize"
          onClick={() => void minimizeWindow()}
          hoverClass="hover:bg-gray-200/70 dark:hover:bg-neutral-800"
        >
          <Minus className="w-3.5 h-3.5" />
        </WindowButton>
        <WindowButton
          label={maximized ? 'Restore' : 'Maximize'}
          onClick={handleToggleMax}
          hoverClass="hover:bg-gray-200/70 dark:hover:bg-neutral-800"
        >
          {maximized ? (
            <CopyIcon className="w-3.5 h-3.5 -scale-x-100" />
          ) : (
            <Square className="w-3 h-3" />
          )}
        </WindowButton>
        <WindowButton
          label="Close"
          onClick={() => void closeWindow()}
          hoverClass="hover:bg-red-500 hover:text-white"
        >
          <X className="w-3.5 h-3.5" />
        </WindowButton>
      </div>
    </div>
  );
}

function WindowButton({
  children,
  label,
  onClick,
  hoverClass,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  hoverClass: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`w-8 h-6 flex items-center justify-center rounded-md transition-colors ${hoverClass}`}
    >
      {children}
    </button>
  );
}
