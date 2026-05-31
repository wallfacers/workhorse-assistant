import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Copy as CopyIcon, FolderOpen, Minus, Square, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  isTauri,
  minimizeWindow,
  toggleMaximizeWindow,
  closeWindow,
} from '../ipc';
import { useSession } from '../session/SessionProvider';

interface TitleBarProps {
  /** Synced maximize state (owned by App via useWindowState). */
  maximized: boolean;
}

/**
 * Frameless top title bar.
 *
 * Only renders in Tauri mode. Layout: a project switcher on the left
 * (window-level scope, add-project-sessions §4.4), a draggable spacer in the
 * middle, and the OS window controls (`[─][□][×]`) on the right. Browser mode
 * returns null.
 */
export default function TitleBar({ maximized }: TitleBarProps) {
  if (!isTauri()) return null;

  const handleToggleMax = () => void toggleMaximizeWindow();

  return (
    <div className="bg-surface-muted dark:bg-surface-dark select-none flex-shrink-0">
      <div className="h-8 flex items-center gap-1 pl-2 pr-2 text-gray-500 dark:text-gray-400">
        <ProjectSwitcher />
        <div data-tauri-drag-region className="h-full flex-1" />
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

/**
 * Project switcher: lists known project paths and lets the user open a path.
 * A project is the sidecar's `workdir` (an opaque, sidecar-namespace string — D4
 * / D6), so paths are shown and entered verbatim; there is no host folder
 * dialog (a native picker is namespace-mismatched for a remote/WSL sidecar and
 * deferred to `add-wsl-remote`).
 */
function ProjectSwitcher() {
  const { t } = useTranslation();
  const { projects, currentProject, openProject } = useSession();
  const [open, setOpen] = useState(false);
  const [entering, setEntering] = useState(false);
  const [pathText, setPathText] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setEntering(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const label = currentProject
    ? currentProject.split(/[/\\]/).filter(Boolean).pop() || currentProject
    : t('project.default');

  const submitPath = () => {
    const next = pathText.trim();
    if (next) {
      void openProject(next);
      setOpen(false);
      setEntering(false);
      setPathText('');
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={currentProject || t('project.default')}
        className={`flex h-6 max-w-[240px] items-center gap-1 rounded-md px-2 text-[12px] font-medium transition-colors hover:bg-gray-200/70 hover:text-gray-700 dark:hover:bg-neutral-800 dark:hover:text-gray-200 ${
          open ? 'bg-gray-200/70 text-gray-700 dark:bg-neutral-800 dark:text-gray-200' : ''
        }`}
      >
        <FolderOpen className="h-3.5 w-3.5 flex-shrink-0" />
        <span className="truncate">{label}</span>
        <ChevronDown className="h-3 w-3 flex-shrink-0 opacity-60" />
      </button>
      {open && (
        <div className="absolute left-0 top-7 z-50 min-w-[240px] overflow-hidden rounded-md border border-outline bg-surface py-1 shadow-lg dark:border-outline-dark dark:bg-surface-dark-elevated">
          {projects.map((p) => (
            <button
              key={p.path}
              type="button"
              onClick={() => {
                void openProject(p.path);
                setOpen(false);
              }}
              title={p.path}
              className={`block w-full truncate px-3 py-1.5 text-left text-[12.5px] transition-colors hover:bg-surface-muted dark:hover:bg-surface-dark-muted ${
                p.path === currentProject
                  ? 'font-semibold text-on-surface dark:text-on-canvas-dark'
                  : 'text-gray-600 dark:text-gray-300'
              }`}
            >
              {p.path}
            </button>
          ))}
          {projects.length > 0 && <div className="my-1 border-t border-outline/50 dark:border-neutral-800/60" />}
          {entering ? (
            <div className="px-2 py-1">
              <input
                autoFocus
                value={pathText}
                onChange={(e) => setPathText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing) return;
                  if (e.key === 'Enter') submitPath();
                  if (e.key === 'Escape') setEntering(false);
                }}
                placeholder={t('project.pathPlaceholder')}
                className="w-full rounded border border-outline bg-white px-2 py-1 text-[12px] text-gray-900 outline-none focus:ring-1 focus:ring-gray-300 dark:border-neutral-700 dark:bg-surface-dark dark:text-gray-100 dark:focus:ring-neutral-700"
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEntering(true)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] text-on-surface transition-colors hover:bg-surface-muted dark:text-on-canvas-dark dark:hover:bg-surface-dark-muted"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              <span>{t('project.open')}</span>
            </button>
          )}
        </div>
      )}
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
