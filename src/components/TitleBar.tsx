import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Copy as CopyIcon, FolderOpen, FolderSearch, Minus, Square, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  isTauri,
  minimizeWindow,
  toggleMaximizeWindow,
  closeWindow,
} from '../ipc';
import { useSession } from '../session/SessionProvider';
import ProjectBrowser from './ProjectBrowser';

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
      <div className="h-8 flex items-center gap-1 pl-2 pr-2 text-on-surface-muted dark:text-on-canvas-dark-muted">
        <ProjectSwitcher />
        <div data-tauri-drag-region className="h-full flex-1" />
        <WindowButton
          label="Minimize"
          onClick={() => void minimizeWindow()}
          hoverClass="hover:bg-canvas/70 dark:hover:bg-surface-dark-muted"
        >
          <Minus className="w-3.5 h-3.5" />
        </WindowButton>
        <WindowButton
          label={maximized ? 'Restore' : 'Maximize'}
          onClick={handleToggleMax}
          hoverClass="hover:bg-canvas/70 dark:hover:bg-surface-dark-muted"
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
          hoverClass="hover:bg-danger hover:text-on-primary"
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
  const { projects, recentProjects, currentProject, openProject, pendingPickerRequest, resolvePicker } = useSession();
  const [open, setOpen] = useState(false);
  const [entering, setEntering] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const [pathText, setPathText] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const closeMenu = () => {
    setOpen(false);
    setEntering(false);
    setBrowsing(false);
    setPathText('');
    // If the agent had a pending picker request and the user dismissed the
    // popover by clicking outside, settle it with null (cancel).
    if (pendingPickerRequest) {
      resolvePicker(null);
    }
  };

  // Known paths = sidecar projects (eventual source of truth) ∪ locally-
  // remembered recents ∪ the current selection, most-relevant first, deduped.
  // Until the sidecar's GET /v1/projects ships, `projects` is empty and this is
  // backed entirely by the local recents list.
  const knownPaths: string[] = [];
  const seen = new Set<string>();
  for (const p of [...projects.map((x) => x.path), ...recentProjects, currentProject]) {
    if (p && !seen.has(p)) {
      seen.add(p);
      knownPaths.push(p);
    }
  }

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        closeMenu();
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Agent confirm flow (D5): when a pending picker request arrives, open the
  // popover in browsing mode pre-navigated to the candidate path.
  useEffect(() => {
    if (!pendingPickerRequest) return;
    setOpen(true);
    setBrowsing(true);
    setEntering(false);
  }, [pendingPickerRequest]);

  // Track the live request so the unmount cleanup (deps `[]`) can read it
  // without capturing a stale snapshot.
  const pendingRef = useRef(pendingPickerRequest);
  pendingRef.current = pendingPickerRequest;

  // Cleanup (D5 / spec "Pending request never leaks"): if this switcher unmounts
  // while a request is outstanding, cancel it so the agent's tool call settles
  // instead of hanging on a picker that is no longer mounted.
  useEffect(() => {
    return () => {
      if (pendingRef.current) resolvePicker(null);
    };
  }, [resolvePicker]);

  const label = currentProject
    ? currentProject.split(/[/\\]/).filter(Boolean).pop() || currentProject
    : t('project.default');

  const submitPath = () => {
    const next = pathText.trim();
    if (next) {
      void openProject(next);
      closeMenu();
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={currentProject || t('project.default')}
        className={`flex h-6 max-w-[240px] items-center gap-1 rounded-md px-2 text-[12px] font-medium transition-colors hover:bg-canvas/70 hover:text-on-surface dark:hover:bg-surface-dark-muted dark:hover:text-on-canvas-dark ${
          open ? 'bg-canvas/70 text-on-surface dark:bg-surface-dark-muted dark:text-on-canvas-dark' : ''
        }`}
      >
        <FolderOpen className="h-3.5 w-3.5 flex-shrink-0" />
        <span className="truncate">{label}</span>
        <ChevronDown className="h-3 w-3 flex-shrink-0 opacity-60" />
      </button>
      {open && (
        <div className="absolute left-0 top-7 z-50 min-w-[240px] overflow-hidden rounded-md border border-outline bg-surface py-1 shadow-lg dark:border-outline-dark dark:bg-surface-dark-elevated">
          {browsing ? (
            <ProjectBrowser
              initialPath={pendingPickerRequest?.path}
              onPick={(p) => {
                if (pendingPickerRequest) {
                  resolvePicker(p);
                } else {
                  void openProject(p);
                }
                setOpen(false);
                setEntering(false);
                setBrowsing(false);
                setPathText('');
              }}
            />
          ) : (
            <>
              {knownPaths.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    void openProject(p);
                    closeMenu();
                  }}
                  title={p}
                  className={`block w-full truncate px-3 py-1.5 text-left text-[12.5px] transition-colors hover:bg-surface-muted dark:hover:bg-surface-dark-muted ${
                    p === currentProject
                      ? 'font-semibold text-on-surface dark:text-on-canvas-dark'
                      : 'text-on-surface-muted dark:text-on-canvas-dark-muted'
                  }`}
                >
                  {p}
                </button>
              ))}
              {knownPaths.length > 0 && <div className="my-1 border-t border-outline/50 dark:border-outline-dark/60" />}
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
                    className="w-full rounded border border-outline bg-surface px-2 py-1 text-[12px] text-on-surface outline-none focus:ring-1 focus:ring-outline-strong dark:border-outline-dark dark:bg-surface-dark dark:text-on-canvas-dark dark:focus:ring-outline-dark"
                  />
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setBrowsing(true)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] text-on-surface transition-colors hover:bg-surface-muted dark:text-on-canvas-dark dark:hover:bg-surface-dark-muted"
                  >
                    <FolderSearch className="h-3.5 w-3.5" />
                    <span>{t('project.browse')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEntering(true)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] text-on-surface transition-colors hover:bg-surface-muted dark:text-on-canvas-dark dark:hover:bg-surface-dark-muted"
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                    <span>{t('project.open')}</span>
                  </button>
                </>
              )}
            </>
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
