import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Check, ChevronDown, Moon, Pencil, Square, CheckSquare, Sun, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AgentConnection } from '../ipc';
import { getAgentEndpoint, setAgentEndpoint } from '../ipc';
import { useApp } from '../context';
import { useSession } from '../session/SessionProvider';

type NavItem = 'theme' | 'shortcuts' | 'agent' | 'sessions';

/** Display labels stay in each language's own script (i18n convention). */
const LANGUAGES: { code: string; label: string }[] = [
  { code: 'zh-CN', label: '中文 (简体)' },
  { code: 'en-US', label: 'English' },
];

interface SettingsModalProps {
  onClose: () => void;
}

const SHORTCUTS: { key: string; descKey: string }[] = [
  { key: '⌘ N',     descKey: 'shortcuts.newTask' },
  { key: '⌘ K',     descKey: 'shortcuts.globalSearch' },
  { key: '⌘ ,',     descKey: 'shortcuts.openSettings' },
  { key: '⌘ W',     descKey: 'shortcuts.closePanel' },
  { key: '⌘ \\',    descKey: 'shortcuts.toggleSidebar' },
  { key: '⌘ T',     descKey: 'shortcuts.newTerminal' },
  { key: '⌘ D',     descKey: 'shortcuts.splitTerminal' },
  { key: '⌘ Enter', descKey: 'shortcuts.sendMessage' },
  { key: '⌘ /',     descKey: 'shortcuts.showShortcuts' },
  { key: 'Esc',     descKey: 'shortcuts.cancelClose' },
];

const STATUS_DOT: Record<AgentConnection['status'], string> = {
  idle: 'bg-gray-400',
  connecting: 'bg-amber-400 animate-pulse',
  connected: 'bg-green-500',
  error: 'bg-red-500',
};

export default function SettingsModal({ onClose }: SettingsModalProps) {
  const { t } = useTranslation();
  const { isDarkMode, setIsDarkMode, agent, autoExpandReasoning, setAutoExpandReasoning } = useApp();
  const [activeNav, setActiveNav] = useState<NavItem>('theme');

  const navLabels: Record<NavItem, string> = {
    theme: t('settings.nav.theme'),
    shortcuts: t('settings.nav.shortcuts'),
    agent: t('settings.nav.agent'),
    sessions: t('settings.nav.sessions'),
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-[810px] h-[520px] bg-white dark:bg-surface-dark-elevated rounded-2xl border border-outline dark:border-neutral-800 shadow-[0_16px_48px_rgba(0,0,0,0.15)] overflow-hidden flex flex-col">

        {/* Header */}
        <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-outline/50 dark:border-neutral-800/60 flex-shrink-0">
          <span className="text-[13.5px] font-semibold text-gray-900 dark:text-gray-100">{t('settings.title')}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('settings.closeSettings')}
            className="p-1 rounded-md text-gray-400 dark:text-gray-500 hover:bg-gray-200/70 dark:hover:bg-neutral-800 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0">

          {/* Left nav */}
          <div className="w-44 flex-shrink-0 border-r border-outline/40 dark:border-neutral-800/40 px-2 py-3 space-y-0.5">
            {(['theme', 'shortcuts', 'agent', 'sessions'] as NavItem[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setActiveNav(item)}
                className={`w-full text-left px-3 py-2 rounded-xl text-[13px] transition-all duration-150 ${
                  activeNav === item
                    ? 'bg-gray-200/70 dark:bg-neutral-800/90 text-gray-900 dark:text-gray-100 font-medium'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200/40 dark:hover:bg-neutral-800/50'
                }`}
              >
                {navLabels[item]}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 overflow-y-auto custom-scrollbar px-6 py-4">
            {activeNav === 'theme' && (
              <ThemeSection isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />
            )}
            {activeNav === 'shortcuts' && <ShortcutsSection />}
            {activeNav === 'agent' && <AgentSection agent={agent} autoExpandReasoning={autoExpandReasoning} setAutoExpandReasoning={setAutoExpandReasoning} />}
            {activeNav === 'sessions' && <SessionsSection />}
          </div>
        </div>
      </div>
    </div>
  );
}

function AgentSection({
  agent,
  autoExpandReasoning,
  setAutoExpandReasoning,
}: {
  agent: AgentConnection;
  autoExpandReasoning: boolean;
  setAutoExpandReasoning: (v: boolean) => void;
}) {
  const { t } = useTranslation();
  const isConnecting = agent.status === 'connecting';
  const isConnected = agent.status === 'connected';

  // Editable endpoint (B4). Loaded from the bridge; saving validates Rust-side
  // and then re-probes via reconnect().
  const [endpoint, setEndpoint] = useState('');
  const [savedEndpoint, setSavedEndpoint] = useState('');
  const [endpointErr, setEndpointErr] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await getAgentEndpoint();
      if (res.ok) {
        setEndpoint(res.value);
        setSavedEndpoint(res.value);
      }
    })();
  }, []);

  const endpointDirty = endpoint.trim() !== savedEndpoint && endpoint.trim() !== '';

  const saveEndpoint = async () => {
    const next = endpoint.trim();
    if (!next || next === savedEndpoint) return;
    setEndpointErr(null);
    const res = await setAgentEndpoint(next);
    if (!res.ok) {
      setEndpointErr(res.error.message);
      return;
    }
    setSavedEndpoint(next);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2000);
    agent.reconnect();
  };

  const statusLabel: Record<AgentConnection['status'], string> = {
    idle: t('agent.status.disconnected'),
    connecting: t('agent.status.connecting'),
    connected: t('agent.status.connected'),
    error: t('agent.status.failed'),
  };

  return (
    <div>
      <p className="text-[11.5px] font-semibold text-gray-400 dark:text-gray-500 tracking-wider mb-4">{t('settings.connection')}</p>

      {/* Status row */}
      <div className="flex items-center gap-2.5 mb-4">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[agent.status]}`} />
        <span className="text-[12.5px] font-medium text-gray-800 dark:text-gray-200">
          {statusLabel[agent.status]}
        </span>
      </div>

      {/* Error message */}
      {agent.error && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-[12px] text-red-700 dark:text-red-300">
          {agent.error}
        </div>
      )}

      {/* Endpoint (editable, B4) */}
      <div className="mb-4">
        <label className="block text-[11px] text-gray-400 dark:text-gray-500 mb-1.5">{t('settings.endpoint')}</label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={endpoint}
            spellCheck={false}
            onChange={(e) => {
              setEndpoint(e.target.value);
              setEndpointErr(null);
            }}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === 'Enter') void saveEndpoint();
            }}
            placeholder="http://127.0.0.1:7821"
            className="min-w-0 flex-1 rounded-lg border border-outline/40 bg-gray-50 px-3 py-2 font-mono text-[12.5px] text-gray-700 outline-none focus:ring-1 focus:ring-gray-300 dark:border-neutral-800/50 dark:bg-neutral-800/60 dark:text-gray-300 dark:focus:ring-neutral-700"
          />
          <button
            type="button"
            onClick={() => void saveEndpoint()}
            disabled={!endpointDirty}
            className="flex-shrink-0 rounded-lg bg-gray-800 px-3 py-2 text-[12px] font-medium text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-gray-200 dark:text-gray-800 dark:hover:bg-gray-300"
          >
            {justSaved ? t('settings.endpointSaved') : t('settings.endpointSave')}
          </button>
        </div>
        {endpointErr && (
          <p className="mt-1 text-[10.5px] text-red-600 dark:text-red-400">{endpointErr}</p>
        )}
        <p className="mt-1 text-[10.5px] text-gray-400 dark:text-gray-500">
          {t('settings.endpointHint')}
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        {isConnected ? (
          <button
            type="button"
            onClick={() => agent.disconnect()}
            className="px-4 py-1.5 rounded-lg border border-outline dark:border-neutral-700 text-[12px] font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors"
          >
            {t('settings.disconnect')}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => agent.reconnect()}
            disabled={isConnecting}
            className="px-4 py-1.5 rounded-lg bg-gray-800 dark:bg-gray-200 text-[12px] font-medium text-white dark:text-gray-800 hover:bg-gray-700 dark:hover:bg-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isConnecting ? t('agent.status.connecting') : t('settings.reconnect')}
          </button>
        )}
      </div>

      {/* Reasoning display preference — display-only, never toggles thinking on
          the sidecar (whether thinking runs is decided by the sidecar config). */}
      <div className="mt-6 pt-4 border-t border-outline/40 dark:border-neutral-800/40">
        <p className="text-[11.5px] font-semibold text-gray-400 dark:text-gray-500 tracking-wider mb-3">{t('settings.reasoningDisplay')}</p>
        <button
          type="button"
          role="switch"
          aria-checked={autoExpandReasoning}
          onClick={() => setAutoExpandReasoning(!autoExpandReasoning)}
          className="w-full flex items-center justify-between gap-3"
        >
          <span className="text-left">
            <span className="block text-[12.5px] font-medium text-gray-800 dark:text-gray-200">{t('settings.autoExpandThinking')}</span>
            <span className="block text-[10.5px] text-gray-400 dark:text-gray-500 mt-0.5">{t('settings.autoExpandDescription')}</span>
          </span>
          <span className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${autoExpandReasoning ? 'bg-gray-800 dark:bg-gray-200' : 'bg-gray-300 dark:bg-neutral-700'}`}>
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white dark:bg-gray-900 shadow transition-transform ${autoExpandReasoning ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </span>
        </button>
      </div>
    </div>
  );
}

function ThemeSection({
  isDarkMode,
  setIsDarkMode,
}: {
  isDarkMode: boolean;
  setIsDarkMode: (v: boolean) => void;
}) {
  const { t } = useTranslation();

  return (
    <div>
      <p className="text-[11.5px] font-semibold text-gray-400 dark:text-gray-500 tracking-wider mb-4">{t('settings.appearance')}</p>
      <div className="grid grid-cols-2 gap-3">
        <ThemeOption
          label={t('settings.lightTheme')}
          icon={<Sun className="w-5 h-5" />}
          active={!isDarkMode}
          onClick={() => setIsDarkMode(false)}
        />
        <ThemeOption
          label={t('settings.darkTheme')}
          icon={<Moon className="w-5 h-5" />}
          active={isDarkMode}
          onClick={() => setIsDarkMode(true)}
        />
      </div>

      {/* Language selector */}
      <div className="mt-4 pt-4 border-t border-outline/40 dark:border-neutral-800/40">
        <label className="block text-[11px] text-gray-400 dark:text-gray-500 mb-1.5">
          {t('settings.language')}
        </label>
        <LanguageSelect />
      </div>
    </div>
  );
}

/**
 * Language picker. Mirrors the terminal `ProfileMenu` dropdown (custom popover
 * over native `<select>`): a trigger that reflects the current language and a
 * floating list sharing the same surface/outline tokens and click-outside close.
 */
function LanguageSelect() {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const current = LANGUAGES.find((l) => l.code === i18n.language) ?? LANGUAGES[0];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-outline/40 bg-gray-50 px-3 py-2 text-[12.5px] text-gray-700 transition-colors hover:bg-gray-100 dark:border-neutral-800/50 dark:bg-neutral-800/60 dark:text-gray-300 dark:hover:bg-neutral-800"
      >
        <span>{current.label}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 flex-shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="absolute left-0 right-0 z-50 mt-1 overflow-hidden rounded-md border border-outline bg-surface py-1 shadow-lg dark:border-outline-dark dark:bg-surface-dark-elevated">
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => {
                i18n.changeLanguage(l.code);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between px-3 py-1.5 text-left text-[13px] text-on-surface transition-colors hover:bg-surface-muted dark:text-on-canvas-dark dark:hover:bg-surface-dark-muted"
            >
              <span>{l.label}</span>
              {l.code === current.code && (
                <Check className="h-3.5 w-3.5 flex-shrink-0 text-gray-500 dark:text-gray-400" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ThemeOption({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-2.5 py-5 rounded-xl border-2 transition-all duration-150 ${
        active
          ? 'border-gray-800 dark:border-gray-200 bg-gray-50 dark:bg-neutral-800/80'
          : 'border-outline dark:border-neutral-700 hover:border-gray-400 dark:hover:border-neutral-500 hover:bg-gray-50/60 dark:hover:bg-neutral-800/30'
      }`}
    >
      <span className={active ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'}>
        {icon}
      </span>
      <span className={`text-[12.5px] font-medium ${active ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'}`}>
        {label}
      </span>
    </button>
  );
}

function ShortcutsSection() {
  const { t } = useTranslation();

  return (
    <div>
      <p className="text-[11.5px] font-semibold text-gray-400 dark:text-gray-500 tracking-wider mb-4">{t('settings.keyboardShortcuts')}</p>
      <div className="grid grid-cols-2 gap-x-8 gap-y-0">
        {SHORTCUTS.map(({ key, descKey }) => (
          <div
            key={key}
            className="flex items-center justify-between py-2 border-b border-outline/30 dark:border-neutral-800/50"
          >
            <span className="text-[12.5px] text-gray-600 dark:text-gray-400">{t(descKey)}</span>
            <kbd className="px-1.5 py-0.5 rounded-md bg-gray-100 dark:bg-neutral-800 border border-outline/60 dark:border-neutral-700 text-[11px] font-mono text-gray-700 dark:text-gray-300 flex-shrink-0">
              {key}
            </kbd>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SessionsSection — session management table (add-session-management)
// ---------------------------------------------------------------------------

/** Format a date string as relative time in the current locale. */
function relativeTime(date: string, locale: string): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  if (isNaN(then)) return '—';
  const diffMs = now - then;
  const diffSec = Math.round(diffMs / 1000);
  const diffMin = Math.round(diffSec / 60);
  const diffHr = Math.round(diffMin / 60);
  const diffDay = Math.round(diffHr / 24);

  const isZh = locale.startsWith('zh');

  if (diffSec < 60) return isZh ? '刚刚' : 'just now';
  if (diffMin < 60) return isZh ? `${diffMin} 分钟前` : `${diffMin}m ago`;
  if (diffHr < 24) return isZh ? `${diffHr} 小时前` : `${diffHr}h ago`;
  if (diffDay === 1) return isZh ? '昨天' : 'Yesterday';
  if (diffDay < 7) return isZh ? `${diffDay} 天前` : `${diffDay}d ago`;
  return new Date(then).toLocaleDateString(isZh ? 'zh-CN' : 'en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function SessionsSection() {
  const { t, i18n } = useTranslation();
  const { listedSessionsMeta, renameSession, deleteSession } = useSession();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmingBatch, setConfirmingBatch] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const renameEndedRef = useRef(false);

  // Clear messages after 3s.
  useEffect(() => {
    if (!successMessage && !errorMessage) return;
    const id = setTimeout(() => {
      setSuccessMessage(null);
      setErrorMessage(null);
    }, 3000);
    return () => clearTimeout(id);
  }, [successMessage, errorMessage]);

  // Sort by updatedAt descending (most recently modified first).
  const sorted = listedSessionsMeta && listedSessionsMeta.length > 0
    ? [...listedSessionsMeta].sort((a, b) => {
        const da = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const db = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return db - da;
      })
    : [];

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <div className="text-[11.5px] font-semibold text-gray-400 dark:text-gray-500 tracking-wider mb-4">
          {t('sessions.title')}
        </div>
        <div className="text-[12.5px] text-gray-400 dark:text-gray-500 mb-1">
          {t('sessions.empty.title')}
        </div>
        <div className="text-[11px] text-gray-400/70 dark:text-gray-500/70">
          {t('sessions.empty.description')}
        </div>
      </div>
    );
  }

  const allSelected = sorted.length > 0 && selected.size === sorted.length;
  const someSelected = selected.size > 0 && !allSelected;

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(sorted.map((s) => s.id)));
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openRename = (id: string, title: string) => {
    setRenamingId(id);
    setRenameText(title);
    renameEndedRef.current = false;
  };

  const submitRename = async () => {
    if (renameEndedRef.current) return;
    renameEndedRef.current = true;
    const next = renameText.trim();
    if (next && renamingId) {
      const ok = await renameSession(renamingId, next);
      if (!ok) setErrorMessage(t('common.retry'));
    }
    setRenamingId(null);
  };

  const cancelRename = () => {
    renameEndedRef.current = true;
    setRenamingId(null);
  };

  const doDelete = useCallback(async (id: string) => {
    if (deletingId) return; // already deleting something
    setDeletingId(id);
    const ok = await deleteSession(id);
    setDeletingId(null);
    if (ok) {
      setSuccessMessage(t('sessions.deletedMessage', { count: 1 }));
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } else {
      setErrorMessage(t('common.retry'));
    }
  }, [deleteSession, t, deletingId]);

  const confirmBatchDelete = async () => {
    if (deletingId) return;
    setDeletingId('__batch__');
    setConfirmingBatch(false);
    const ids = [...selected];
    let failed = 0;
    for (const id of ids) {
      const ok = await deleteSession(id);
      if (!ok) failed++;
    }
    setDeletingId(null);
    if (failed > 0) {
      setErrorMessage(`${t('sessions.deletedMessage', { count: ids.length - failed })}，${failed} 个失败`);
    } else {
      setSuccessMessage(t('sessions.deletedMessage', { count: ids.length }));
    }
    setSelected(new Set());
  };

  const statusKey = (status: string): 'idle' | 'running' =>
    status === 'running' ? 'running' : 'idle';

  return (
    <div>
      {/* Title row */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11.5px] font-semibold text-gray-400 dark:text-gray-500 tracking-wider">
          {t('sessions.title')}
        </p>
        <span className="text-[10.5px] text-gray-400 dark:text-gray-500">
          {sorted.length} 个会话
        </span>
      </div>

      {/* Feedback banner: error takes precedence over success */}
      {(errorMessage || successMessage) && (
        <div className={`mb-3 px-3 py-1.5 rounded-lg border text-[12px] flex items-center justify-between ${
          errorMessage
            ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300'
            : 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900/50 text-green-700 dark:text-green-300'
        }`}>
          <span>{errorMessage || successMessage}</span>
          <button
            type="button"
            onClick={() => { setSuccessMessage(null); setErrorMessage(null); }}
            className="flex-shrink-0 hover:opacity-70"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Batch toolbar */}
      {selected.size > 0 && (
        <div className="mb-2 flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-[var(--color-surface-muted)] dark:bg-[var(--color-surface-dark-muted)]">
          <span className="text-[11px] text-gray-600 dark:text-gray-400">
            已选 {selected.size}/{sorted.length}
          </span>
          {confirmingBatch ? (
            <div className="flex items-center gap-2">
              <span className="text-[10.5px] text-red-600 dark:text-red-400">
                {t('sessions.confirmBatchDelete', { count: selected.size })}
              </span>
              <button
                type="button"
                onClick={confirmBatchDelete}
                disabled={deletingId !== null}
                className="px-2 py-0.5 rounded-md bg-red-600 text-[10.5px] font-semibold text-white hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {t('common.confirm')}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingBatch(false)}
                disabled={deletingId !== null}
                className="px-2 py-0.5 rounded-md border border-outline dark:border-neutral-700 text-[10.5px] text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors"
              >
                {t('common.cancel')}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingBatch(true)}
              disabled={deletingId !== null}
              className="px-2 py-0.5 rounded-md text-[10.5px] font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors disabled:opacity-50"
            >
              {t('sessions.deleteSelected', { count: selected.size })}
            </button>
          )}
        </div>
      )}

      {/* Table */}
      <div className="rounded-[12px] border border-outline dark:border-outline-dark overflow-hidden">
        <div className="overflow-y-auto max-h-[310px] custom-scrollbar">
          <table className="w-full text-[11.5px]" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="w-10 px-2 py-2 bg-[var(--color-surface-muted)] dark:bg-[var(--color-surface-dark)] border-b border-r border-outline dark:border-outline-dark font-semibold text-left">
                  <button
                    type="button"
                    onClick={toggleAll}
                    className="p-0.5 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                    aria-label={t('sessions.selectAll')}
                  >
                    {allSelected ? (
                      <CheckSquare className="w-3.5 h-3.5 text-gray-700 dark:text-gray-200" />
                    ) : someSelected ? (
                      <CheckSquare className="w-3.5 h-3.5 text-gray-400" />
                    ) : (
                      <Square className="w-3.5 h-3.5" />
                    )}
                  </button>
                </th>
                <th className="text-left px-2.5 py-2 bg-[var(--color-surface-muted)] dark:bg-[var(--color-surface-dark)] border-b border-r border-outline dark:border-outline-dark font-semibold text-gray-700 dark:text-gray-200">
                  {t('sessions.columns.title')}
                </th>
                <th className="w-16 text-left px-2.5 py-2 bg-[var(--color-surface-muted)] dark:bg-[var(--color-surface-dark)] border-b border-r border-outline dark:border-outline-dark font-semibold text-gray-700 dark:text-gray-200">
                  {t('sessions.columns.status')}
                </th>
                <th className="w-14 text-right px-2.5 py-2 bg-[var(--color-surface-muted)] dark:bg-[var(--color-surface-dark)] border-b border-r border-outline dark:border-outline-dark font-semibold text-gray-700 dark:text-gray-200">
                  {t('sessions.columns.messages')}
                </th>
                <th className="w-24 text-left px-2.5 py-2 bg-[var(--color-surface-muted)] dark:bg-[var(--color-surface-dark)] border-b border-r border-outline dark:border-outline-dark font-semibold text-gray-700 dark:text-gray-200">
                  {t('sessions.columns.updated')}
                </th>
                <th className="w-16 px-2.5 py-2 bg-[var(--color-surface-muted)] dark:bg-[var(--color-surface-dark)] border-b border-outline dark:border-outline-dark font-semibold text-gray-700 dark:text-gray-200">
                  {t('sessions.columns.actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((s) => {
                const isSelected = selected.has(s.id);
                const st = statusKey(s.status);

                return (
                  <tr
                    key={s.id}
                    className={`border-b border-outline/50 dark:border-outline-dark/50 last:border-b-0 transition-colors ${
                      isSelected
                        ? 'bg-[var(--color-surface-muted)]/60 dark:bg-[var(--color-surface-dark-muted)]/60'
                        : 'hover:bg-[var(--color-surface-muted)]/30 dark:hover:bg-[var(--color-surface-dark-muted)]/30'
                    }`}
                  >
                    {/* Checkbox */}
                    <td className="px-2 py-2 border-r border-outline/50 dark:border-outline-dark/50">
                      <button
                        type="button"
                        onClick={() => toggleOne(s.id)}
                        className="p-0.5 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                      >
                        {isSelected ? (
                          <CheckSquare className="w-3.5 h-3.5 text-gray-700 dark:text-gray-200" />
                        ) : (
                          <Square className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </td>

                    {/* Title */}
                    <td className="px-2.5 py-2 border-r border-outline/50 dark:border-outline-dark/50">
                      {renamingId === s.id ? (
                        <input
                          autoFocus
                          value={renameText}
                          onChange={(e) => setRenameText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.nativeEvent.isComposing) return;
                            if (e.key === 'Enter') void submitRename();
                            if (e.key === 'Escape') cancelRename();
                          }}
                          onBlur={() => void submitRename()}
                          className="w-full rounded-md border border-outline bg-white px-2 py-0.5 text-[11.5px] text-gray-900 outline-none focus:ring-1 focus:ring-gray-300 dark:border-neutral-700 dark:bg-surface-dark dark:text-gray-100 dark:focus:ring-neutral-700"
                        />
                      ) : (
                        <span
                          className={`truncate max-w-[200px] block ${
                            s.title
                              ? 'text-gray-800 dark:text-gray-200'
                              : 'text-gray-400 dark:text-gray-500 italic'
                          }`}
                        >
                          {s.title || t('sessions.untitled')}
                        </span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-2.5 py-2 border-r border-outline/50 dark:border-outline-dark/50">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                            st === 'running' ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
                          }`}
                        />
                        <span className="text-[10.5px] text-gray-500 dark:text-gray-400">
                          {t(`sessions.status.${st}`)}
                        </span>
                      </span>
                    </td>

                    {/* Message count */}
                    <td className="px-2.5 py-2 text-right text-[10.5px] text-gray-500 dark:text-gray-400 tabular-nums border-r border-outline/50 dark:border-outline-dark/50">
                      {s.messageCount ?? 0}
                    </td>

                    {/* Updated time */}
                    <td className="px-2.5 py-2 text-[10.5px] text-gray-500 dark:text-gray-400 whitespace-nowrap border-r border-outline/50 dark:border-outline-dark/50">
                      {s.updatedAt ? relativeTime(s.updatedAt, i18n.language) : '—'}
                    </td>

                    {/* Actions */}
                    <td className="px-2.5 py-2">
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          aria-label={t('sessions.rename')}
                          disabled={deletingId !== null}
                          onClick={() => openRename(s.id, s.title)}
                          className="p-1 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200/70 dark:hover:bg-neutral-800 transition-colors disabled:opacity-40"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          aria-label={t('sessions.delete')}
                          disabled={deletingId !== null}
                          onClick={() => void doDelete(s.id)}
                          className={`p-1 rounded transition-colors disabled:opacity-40 ${
                            deletingId === s.id
                              ? 'text-red-400 dark:text-red-500 cursor-wait'
                              : 'text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40'
                          }`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
