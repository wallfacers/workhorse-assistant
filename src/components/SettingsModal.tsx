import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Check, ChevronDown, Moon, Sun, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AgentConnection } from '../ipc';
import { useApp } from '../context';

type NavItem = 'theme' | 'shortcuts' | 'agent';

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
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-[620px] h-[400px] bg-white dark:bg-surface-dark-elevated rounded-2xl border border-outline dark:border-neutral-800 shadow-[0_16px_48px_rgba(0,0,0,0.15)] overflow-hidden flex flex-col">

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
            {(['theme', 'shortcuts', 'agent'] as NavItem[]).map((item) => (
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
        {agent.sessionId && (
          <span className="text-[11px] text-gray-400 dark:text-gray-500 font-mono">
            {agent.sessionId.slice(0, 12)}
          </span>
        )}
      </div>

      {/* Error message */}
      {agent.error && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-[12px] text-red-700 dark:text-red-300">
          {agent.error}
        </div>
      )}

      {/* Endpoint (read-only for V1) */}
      <div className="mb-4">
        <label className="block text-[11px] text-gray-400 dark:text-gray-500 mb-1.5">{t('settings.endpoint')}</label>
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-neutral-800/60 border border-outline/40 dark:border-neutral-800/50">
          <span className="text-[12.5px] font-mono text-gray-700 dark:text-gray-300">
            http://127.0.0.1:7821
          </span>
          <span className="text-[10px] text-gray-400 dark:text-gray-500">{t('settings.defaultValue')}</span>
        </div>
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
