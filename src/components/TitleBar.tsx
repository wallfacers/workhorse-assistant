import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Copy as CopyIcon, FolderOpen, Minus, Square, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  isTauri,
  minimizeWindow,
  toggleMaximizeWindow,
  closeWindow,
  pickFolder,
  getRuntimeConfig,
} from '../ipc';
import { useSession } from '../session/SessionProvider';
import { useConfirm } from './ConfirmProvider';
import { useToast } from './ToastProvider';
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
 * Project switcher: lists known project paths and lets the user open a project.
 *
 * In **Native runtime** mode the "Open project" button fires the OS-native
 * folder-picker dialog (`tauri-plugin-dialog`). In **WSL runtime** mode it
 * falls back to the in-app `ProjectBrowser` because the native picker cannot
 * navigate the sidecar's POSIX namespace.
 */
function ProjectSwitcher() {
  const { t } = useTranslation();
  const {
    projects,
    recentProjects,
    currentProject,
    openProject,
    deleteProject,
    pendingPickerRequest,
    resolvePicker,
  } = useSession();
  const confirm = useConfirm();
  const toast = useToast();

  const [menuOpen, setMenuOpen] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const closeMenu = () => {
    setMenuOpen(false);
    setBrowsing(false);
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
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        closeMenu();
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  // Agent confirm flow (D5): when a pending picker request arrives, open the
  // popover in browsing mode pre-navigated to the candidate path.
  useEffect(() => {
    if (!pendingPickerRequest) return;
    setMenuOpen(true);
    setBrowsing(true);
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

  /** Single "Open project" action — native picker (Native) or in-app browser (WSL).
   *  The WSL-vs-Native decision keys off `RuntimeConfig.mode` (the single source
   *  of truth, same as Terminal) fetched fresh here — NOT the sidecar's
   *  self-reported `/health.distro`, which can disagree with the configured mode. */
  const handleOpenProject = async () => {
    const rt = await getRuntimeConfig();
    const isWslMode = rt.ok && rt.value.mode === 'wsl';
    if (isWslMode) {
      setBrowsing(true);
      return;
    }
    // Native mode: use OS folder dialog.
    const res = await pickFolder();
    if (res.ok && res.value) {
      await openProject(res.value);
      closeMenu();
    }
    // User cancelled (null) or error — do nothing.
  };

  /** Delete a project record (confirmed). Hard-deletes its sessions sidecar-side;
   *  the on-disk directory is untouched, so it can be re-opened later. */
  const requestDeleteProject = async (path: string) => {
    const name = path.split(/[/\\]/).filter(Boolean).pop() || path;
    const ok = await confirm({
      title: t('project.deleteTitle'),
      body: t('project.deleteBody', { name }),
      danger: true,
      confirmText: t('agent.confirmDelete'),
    });
    if (!ok) return;
    const deleted = await deleteProject(path);
    if (deleted) {
      toast({ message: `项目 "${name}" 已删除`, level: 'success' });
    } else {
      toast({ message: '删除项目失败', level: 'error' });
    }
    closeMenu();
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        title={currentProject || t('project.default')}
        className={`flex h-6 max-w-[240px] items-center gap-1 rounded-md px-2 text-[12px] font-medium transition-colors hover:bg-canvas/70 hover:text-on-surface dark:hover:bg-surface-dark-muted dark:hover:text-on-canvas-dark ${
          menuOpen ? 'bg-canvas/70 text-on-surface dark:bg-surface-dark-muted dark:text-on-canvas-dark' : ''
        }`}
      >
        <FolderOpen className="h-3.5 w-3.5 flex-shrink-0" />
        <span className="truncate">{label}</span>
        <ChevronDown className="h-3 w-3 flex-shrink-0 opacity-60" />
      </button>
      {menuOpen && (
        <div className="absolute left-0 top-7 z-50 min-w-[240px] overflow-hidden rounded-lg border border-outline bg-surface py-1 shadow-lg dark:border-outline-dark dark:bg-surface-dark-elevated">
          {browsing ? (
            <ProjectBrowser
              initialPath={pendingPickerRequest?.path}
              onPick={(p) => {
                if (pendingPickerRequest) {
                  resolvePicker(p);
                } else {
                  void openProject(p);
                }
                setMenuOpen(false);
                setBrowsing(false);
              }}
            />
          ) : (
            <>
              {knownPaths.map((p) => (
                <div
                  key={p}
                  className="group/proj flex items-center transition-colors hover:bg-surface-muted dark:hover:bg-surface-dark-muted"
                >
                  <button
                    type="button"
                    onClick={() => {
                      void openProject(p);
                      closeMenu();
                    }}
                    title={p}
                    className={`min-w-0 flex-1 truncate px-3 py-1.5 text-left text-[12.5px] ${
                      p === currentProject
                        ? 'font-semibold text-on-surface dark:text-on-canvas-dark'
                        : 'text-on-surface-muted dark:text-on-canvas-dark-muted'
                    }`}
                  >
                    {p}
                  </button>
                  <span className="mr-1 flex flex-shrink-0 items-center gap-1">
                    {p === currentProject && <Check className="h-3.5 w-3.5 text-on-surface-muted dark:text-on-canvas-dark-muted" />}
                    <button
                      type="button"
                      onClick={() => void requestDeleteProject(p)}
                      aria-label={t('project.delete')}
                      title={t('project.delete')}
                      className="flex-shrink-0 rounded-sm p-1 text-on-surface-muted opacity-0 transition-opacity hover:text-danger group-hover/proj:opacity-100 dark:text-on-canvas-dark-muted"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </div>
              ))}
              {knownPaths.length > 0 && <div className="my-1 border-t border-outline/50 dark:border-outline-dark/60" />}
              <button
                type="button"
                onClick={() => void handleOpenProject()}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] text-on-surface transition-colors hover:bg-surface-muted dark:text-on-canvas-dark dark:hover:bg-surface-dark-muted"
              >
                <FolderOpen className="h-3.5 w-3.5" />
                <span>{t('project.openProject')}</span>
              </button>
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
      className={`w-8 h-6 flex items-center justify-center rounded-sm transition-colors ${hoverClass}`}
    >
      {children}
    </button>
  );
}
