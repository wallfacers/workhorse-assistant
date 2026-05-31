import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../session/SessionProvider';

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
    switchSession,
    newSession,
    renameSession,
    deleteSession,
  } = useSession();

  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameText, setRenameText] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Enter / Escape both unmount the input, which fires `onBlur` → a second
  // `submitRename`. This sentinel makes the rename single-shot: the first of
  // {Enter, Escape, blur} wins; the trailing blur becomes a no-op. Escape sets
  // it too, so a cancel never persists the unconfirmed text. Reset when the
  // rename input is (re)opened.
  const renameEndedRef = useRef(false);

  const switcherRef = useClickOutside(switcherOpen, () => setSwitcherOpen(false));
  const menuRef = useClickOutside(menuOpen, () => {
    setMenuOpen(false);
    setConfirmingDelete(false);
  });

  const title = activeTitle || t('agent.untitledSession');

  const openRename = () => {
    setMenuOpen(false);
    setRenameText(activeTitle);
    renameEndedRef.current = false;
    setRenaming(true);
  };

  const submitRename = () => {
    if (renameEndedRef.current) return;
    renameEndedRef.current = true;
    const next = renameText.trim();
    if (next && activeSessionId) void renameSession(activeSessionId, next);
    setRenaming(false);
  };

  const cancelRename = () => {
    renameEndedRef.current = true; // block the trailing onBlur from persisting
    setRenaming(false);
  };

  return (
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
            className="w-full rounded-md border border-outline bg-white px-2 py-1 text-[12.5px] font-semibold text-gray-900 outline-none focus:ring-1 focus:ring-gray-300 dark:border-neutral-700 dark:bg-surface-dark dark:text-gray-100 dark:focus:ring-neutral-700"
          />
        ) : (
          <button
            type="button"
            onClick={() => setSwitcherOpen((v) => !v)}
            className="flex max-w-full items-center gap-1 rounded-md px-1.5 py-1 text-[12.5px] font-semibold text-gray-800 transition-colors hover:bg-gray-200/70 dark:text-gray-100 dark:hover:bg-neutral-800"
          >
            <span className="truncate">{title}</span>
            <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
          </button>
        )}

        {switcherOpen && (
          <div className="absolute left-0 z-50 mt-1 max-h-[320px] min-w-[220px] overflow-y-auto rounded-md border border-outline bg-surface py-1 shadow-lg dark:border-outline-dark dark:bg-surface-dark-elevated">
            {sessions.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setSwitcherOpen(false);
                  void switchSession(s.id);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-on-surface transition-colors hover:bg-surface-muted dark:text-on-canvas-dark dark:hover:bg-surface-dark-muted"
              >
                <span className="flex-1 truncate">{s.title || t('agent.untitledSession')}</span>
                {s.running && (
                  <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-green-500" title={t('agent.sessionRunning')} />
                )}
                {s.id === activeSessionId && <Check className="h-3.5 w-3.5 flex-shrink-0 text-gray-500" />}
              </button>
            ))}
            <div className="my-1 border-t border-outline/50 dark:border-neutral-800/60" />
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
          </div>
        )}
      </div>

      {/* ⋯ action menu */}
      <div ref={menuRef} className="relative flex-shrink-0">
        <button
          type="button"
          aria-label={t('agent.sessionActions')}
          disabled={!activeSessionId}
          onClick={() => {
            setMenuOpen((v) => !v);
            setConfirmingDelete(false);
          }}
          className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-200/70 hover:text-gray-700 disabled:opacity-40 dark:text-gray-400 dark:hover:bg-neutral-800 dark:hover:text-gray-200"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
        {menuOpen && (
          <div className="absolute right-0 z-50 mt-1 min-w-[160px] overflow-hidden rounded-md border border-outline bg-surface py-1 shadow-lg dark:border-outline-dark dark:bg-surface-dark-elevated">
            <button
              type="button"
              onClick={openRename}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-on-surface transition-colors hover:bg-surface-muted dark:text-on-canvas-dark dark:hover:bg-surface-dark-muted"
            >
              <Pencil className="h-3.5 w-3.5" />
              <span>{t('agent.renameSession')}</span>
            </button>
            {confirmingDelete ? (
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setConfirmingDelete(false);
                  if (activeSessionId) void deleteSession(activeSessionId);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] font-semibold text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>{t('agent.confirmDelete')}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>{t('agent.deleteSession')}</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
