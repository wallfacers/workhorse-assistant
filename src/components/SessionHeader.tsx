import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSession, type SessionListItem } from '../session/SessionProvider';
import { useConfirm } from './ConfirmProvider';
import { useToast } from './ToastProvider';
import Tooltip from './Tooltip';

/** Close a popover when the user clicks outside `ref` (mirrors `ProfileMenu`). */
function useClickOutside(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, onClose]);
  return ref;
}

// --- Time-based grouping helpers ------------------------------------------------

interface SessionGroup {
  key: string;
  label: string;
  sessions: SessionListItem[];
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function groupSessionsByTime(
  sessions: SessionListItem[],
  t: (key: string) => string,
): SessionGroup[] {
  const now = new Date();
  const todayStart = startOfDay(now);
  const yesterdayStart = todayStart - 86_400_000;
  const weekAgoStart = todayStart - 7 * 86_400_000;
  const monthAgoStart = todayStart - 30 * 86_400_000;

  const groups: SessionGroup[] = [
    { key: 'today', label: t('agent.sessionGroup.today'), sessions: [] },
    { key: 'yesterday', label: t('agent.sessionGroup.yesterday'), sessions: [] },
    { key: 'week', label: t('agent.sessionGroup.week'), sessions: [] },
    { key: 'month', label: t('agent.sessionGroup.month'), sessions: [] },
  ];

  // Sort by updatedAt descending (most recent first)
  const sorted = [...sessions].sort((a, b) => {
    const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : Date.now();
    const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : Date.now();
    return tb - ta;
  });

  for (const s of sorted) {
    const ts = s.updatedAt ? new Date(s.updatedAt).getTime() : Date.now();
    if (ts >= todayStart) {
      groups[0].sessions.push(s);
    } else if (ts >= yesterdayStart) {
      groups[1].sessions.push(s);
    } else if (ts >= weekAgoStart) {
      groups[2].sessions.push(s);
    } else if (ts >= monthAgoStart) {
      groups[3].sessions.push(s);
    }
    // sessions older than 30 days are omitted from the switcher
  }

  return groups.filter((g) => g.sessions.length > 0);
}

// --------------------------------------------------------------------------------

/**
 * AgentRail header (add-project-sessions §4.2/4.3): the active session's title on
 * the left opens a session switcher (list + new), and a `⋯` menu on the right
 * exposes rename / delete. Both dropdowns close on outside-click, like the
 * terminal `ProfileMenu`.
 */
export default function SessionHeader() {
  const { t } = useTranslation();
  const {
    sessions,
    activeSessionId,
    activeTitle,
    compactionSessionId,
    retrySessionId,
    switchSession,
    newSession,
    renameSession,
    deleteSession,
  } = useSession();

  const confirm = useConfirm();
  const toast = useToast();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameText, setRenameText] = useState('');

  // Enter / Escape both unmount the input, which fires `onBlur` → a second
  // `submitRename`. This sentinel makes the rename single-shot: the first of
  // {Enter, Escape, blur} wins; the trailing blur becomes a no-op. Escape sets
  // it too, so a cancel never persists the unconfirmed text. Reset when the
  // rename input is (re)opened.
  const renameEndedRef = useRef(false);

  const switcherRef = useClickOutside(switcherOpen, () => setSwitcherOpen(false));
  const menuRef = useClickOutside(menuOpen, () => setMenuOpen(false));

  const requestDelete = async () => {
    if (!activeSessionId) return;
    setMenuOpen(false);
    const ok = await confirm({
      title: t('agent.deleteSession'),
      body: t('agent.deleteSessionConfirm'),
      danger: true,
      confirmText: t('agent.confirmDelete'),
    });
    if (ok) {
      const deleted = await deleteSession(activeSessionId);
      if (deleted) {
        toast({ message: '会话已删除', level: 'success' });
      } else {
        toast({ message: '删除会话失败', level: 'error' });
      }
    }
  };

  const title = activeTitle || t('agent.untitledSession');

  const sessionGroups = useMemo(() => groupSessionsByTime(sessions, t), [sessions, t]);

  const openRename = () => {
    setMenuOpen(false);
    setRenameText(activeTitle);
    renameEndedRef.current = false;
    setRenaming(true);
  };

  const submitRename = async () => {
    if (renameEndedRef.current) return;
    renameEndedRef.current = true;
    const next = renameText.trim();
    if (next && activeSessionId) {
      const ok = await renameSession(activeSessionId, next);
      if (ok) toast({ message: '已重命名', level: 'success' });
    }
    setRenaming(false);
  };

  const cancelRename = () => {
    renameEndedRef.current = true; // block the trailing onBlur from persisting
    setRenaming(false);
  };

  const showCompaction = compactionSessionId === activeSessionId;
  const showRetry = retrySessionId === activeSessionId;

  return (
    <>
      {(showCompaction || showRetry) && (
        <div className="flex flex-shrink-0 items-center gap-2 px-3 py-1">
          {showCompaction && (
            <span className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-2 py-0.5 text-[11px] text-on-surface-muted dark:bg-surface-dark-muted dark:text-on-canvas-dark-muted">
              {t('agent.compactionIndicator')}
            </span>
          )}
          {showRetry && (
            <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[11px] text-warning">
              {t('agent.retryIndicator')}
            </span>
          )}
        </div>
      )}
      <div className="flex flex-shrink-0 items-center justify-between gap-2 px-3 py-2">
      {/* Title + session switcher */}
      <div ref={switcherRef} className="relative min-w-0 flex-1">
        {renaming ? (
          <input
            autoFocus
            value={renameText}
            onChange={(e) => setRenameText(e.target.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === 'Enter') submitRename();
              if (e.key === 'Escape') cancelRename();
            }}
            onBlur={submitRename}
            className="w-full rounded-md border border-outline bg-surface px-2 py-1 text-[12.5px] font-semibold text-on-surface outline-none focus:ring-1 focus:ring-outline-strong dark:border-outline-dark dark:bg-surface-dark dark:text-on-canvas-dark dark:focus:ring-outline-dark"
          />
        ) : (
          <button
            type="button"
            onClick={() => setSwitcherOpen((v) => !v)}
            className="flex max-w-full items-center gap-1 rounded-md px-1.5 py-1 text-[12.5px] font-semibold text-on-surface transition-colors hover:bg-canvas/70 dark:text-on-canvas-dark dark:hover:bg-surface-dark-muted"
          >
            <Tooltip content={title} overflowOnly>
              <span className="block truncate min-w-0">{title}</span>
            </Tooltip>
            <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-on-surface-muted" />
          </button>
        )}

        {switcherOpen && (
          <div className="absolute left-0 z-50 mt-1 max-h-[400px] w-[320px] overflow-y-auto overflow-x-hidden rounded-lg border border-outline bg-surface py-1 shadow-lg dark:border-outline-dark dark:bg-surface-dark-elevated">
            {/* New session — always at the top */}
            <button
              type="button"
              onClick={() => {
                setSwitcherOpen(false);
                void newSession();
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-on-surface transition-colors hover:bg-surface-muted dark:text-on-canvas-dark dark:hover:bg-surface-dark-muted"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>{t('agent.newSession')}</span>
            </button>
            <div className="my-1 border-t border-outline/50 dark:border-outline-dark/60" />

            {/* Time-grouped session list */}
            {sessionGroups.map((group) => (
              <div key={group.key}>
                <div className="px-3 pt-2 pb-0.5 text-[11px] font-medium uppercase tracking-wide text-on-surface-muted dark:text-on-canvas-dark-muted">
                  {group.label}
                </div>
                {group.sessions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setSwitcherOpen(false);
                      void switchSession(s.id);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-on-surface transition-colors hover:bg-surface-muted dark:text-on-canvas-dark dark:hover:bg-surface-dark-muted"
                  >
                    <Tooltip content={s.title || t('agent.untitledSession')} overflowOnly>
                      <span className="block truncate min-w-0">{s.title || t('agent.untitledSession')}</span>
                    </Tooltip>
                    {(s.running || s.id === activeSessionId) && (
                      <span className="ml-auto flex flex-shrink-0 items-center gap-2">
                        {s.running && (
                          <Tooltip content={t('agent.sessionRunning')}>
                            <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-success" />
                          </Tooltip>
                        )}
                        {s.id === activeSessionId && <Check className="h-3.5 w-3.5 flex-shrink-0 text-on-surface-muted" />}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ⋯ action menu */}
      <div ref={menuRef} className="relative flex-shrink-0">
        <button
          type="button"
          aria-label={t('agent.sessionActions')}
          disabled={!activeSessionId}
          onClick={() => setMenuOpen((v) => !v)}
          className="rounded-sm p-1.5 text-on-surface-muted transition-colors hover:bg-canvas/70 hover:text-on-surface disabled:opacity-40 dark:text-on-canvas-dark-muted dark:hover:bg-surface-dark-muted dark:hover:text-on-canvas-dark"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
        {menuOpen && (
          <div className="absolute right-0 z-50 mt-1 min-w-[160px] overflow-hidden rounded-lg border border-outline bg-surface py-1 shadow-lg dark:border-outline-dark dark:bg-surface-dark-elevated">
            <button
              type="button"
              onClick={openRename}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-on-surface transition-colors hover:bg-surface-muted dark:text-on-canvas-dark dark:hover:bg-surface-dark-muted"
            >
              <Pencil className="h-3.5 w-3.5" />
              <span>{t('agent.renameSession')}</span>
            </button>
            <button
              type="button"
              onClick={() => void requestDelete()}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-danger transition-colors hover:bg-danger/10 dark:text-danger dark:hover:bg-danger/10"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>{t('agent.deleteSession')}</span>
            </button>
          </div>
        )}
      </div>
    </div>
    </>
  );
}
