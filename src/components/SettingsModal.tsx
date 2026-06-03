import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Check, ChevronDown, Moon, Pencil, Square, CheckSquare, Sun, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type {
  AgentConnection,
  WslDetect,
  RuntimeConfig,
  RuntimeKind,
  SupervisorStatus,
  StatusTone,
} from '../ipc';
import {
  getAgentEndpoint,
  setAgentEndpoint,
  wslDetect,
  getRuntimeConfig,
  setRuntimeConfig,
  supervisorStatus,
  onSupervisorStatus,
  unifiedStatus,
} from '../ipc';
import { useApp } from '../context';
import { useConfirm } from './ConfirmProvider';
import { useToast } from './ToastProvider';
import { useSession } from '../session/SessionProvider';
import type { AgentSessionMeta } from '../ipc/agent';

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

/** Single status-dot color per unified-status tone (unify-runtime-source-panel). */
const TONE_DOT: Record<StatusTone, string> = {
  idle: 'bg-on-surface-muted',
  pending: 'bg-warning animate-pulse',
  ok: 'bg-success',
  error: 'bg-danger',
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
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-[810px] h-[520px] bg-surface dark:bg-surface-dark-elevated rounded-lg border border-outline dark:border-outline-dark shadow-[0_16px_48px_rgba(0,0,0,0.15)] overflow-hidden flex flex-col">

        {/* Header */}
        <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-outline/50 dark:border-outline-dark/60 flex-shrink-0">
          <span className="text-[13.5px] font-semibold text-on-surface dark:text-on-canvas-dark">{t('settings.title')}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('settings.closeSettings')}
            className="p-1 rounded-sm text-on-surface-muted dark:text-on-canvas-dark-muted hover:bg-canvas/70 dark:hover:bg-surface-dark-muted hover:text-on-surface dark:hover:text-on-canvas-dark transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0">

          {/* Left nav */}
          <div className="w-44 flex-shrink-0 border-r border-outline/40 dark:border-outline-dark/40 px-2 py-3 space-y-0.5">
            {(['theme', 'shortcuts', 'agent', 'sessions'] as NavItem[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setActiveNav(item)}
                className={`w-full text-left px-3 py-2 rounded-md text-[13px] transition-all duration-150 ${
                  activeNav === item
                    ? 'bg-canvas/70 dark:bg-surface-dark-muted/90 text-on-surface dark:text-on-canvas-dark font-medium'
                    : 'text-on-surface-muted dark:text-on-canvas-dark-muted hover:bg-canvas/40 dark:hover:bg-surface-dark-muted/50'
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

/**
 * Unified 「运行来源」 panel (unify-runtime-source-panel). Merges the former
 * connection block and runtime-mode block into one axis: `原生 / WSL / 远程`.
 *
 *  - 原生/WSL: the supervisor hosts a local sidecar; the endpoint host is locked
 *    to loopback and only the port is adjustable (advanced). Status comes from
 *    the supervisor.
 *  - 远程: connect to an agent already running elsewhere. The supervisor stays
 *    Disabled (R2) and reachability is owned by the auto-connect probe; the full
 *    endpoint is editable.
 *
 * A single derived status dot and a single 「应用」 action replace the two of each
 * that used to exist. The endpoint and the (former) `RuntimeConfig.port` are now
 * the same value — the port is parsed from the endpoint.
 */
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
  const { resetProjectForRuntimeSwitch } = useSession();
  const toast = useToast();

  const [detect, setDetect] = useState<WslDetect | null>(null);
  const [config, setConfig] = useState<RuntimeConfig | null>(null);
  const [supStatus, setSupStatus] = useState<SupervisorStatus>({ state: 'disabled' });
  // Staged text fields, committed on 「应用」. `port` is the managed-mode loopback
  // port; `remoteEndpoint` is the full address typed in remote mode.
  const [override, setOverride] = useState('');
  const [port, setPort] = useState('');
  const [remoteEndpoint, setRemoteEndpoint] = useState('');
  const [endpointErr, setEndpointErr] = useState<string | null>(null);
  const [justApplied, setJustApplied] = useState(false);
  // Pending reset timer for the 「已应用」 flash, cleared on a repeat apply / unmount.
  const justAppliedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void (async () => {
      const d = await wslDetect();
      if (d.ok) setDetect(d.value);
      const c = await getRuntimeConfig();
      if (c.ok) {
        setConfig(c.value);
        setOverride(c.value.serveCmdOverride ?? '');
      }
      const ep = await getAgentEndpoint();
      if (ep.ok) {
        setRemoteEndpoint(ep.value);
        setPort(portOf(ep.value));
      }
      const s = await supervisorStatus();
      if (s.ok) setSupStatus(s.value);
    })();
    let unlisten: (() => void) | undefined;
    // Guard the listen() promise against an unmount that races its resolution:
    // if we've already torn down, unlisten immediately instead of leaking.
    let cancelled = false;
    void onSupervisorStatus(setSupStatus).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten?.();
      if (justAppliedTimer.current) clearTimeout(justAppliedTimer.current);
    };
  }, []);

  // Persist runtime config, re-drive the supervisor, and re-probe. A mode/distro
  // change crosses filesystem namespaces, so drop the remembered project first —
  // the bootstrap re-seeds from the new runtime's default workdir on reconnect.
  const applyRuntime = async (next: RuntimeConfig) => {
    const namespaceChanged = !!config && (next.mode !== config.mode || next.distro !== config.distro);
    setConfig(next);
    const res = await setRuntimeConfig(next);
    if (res.ok) {
      if (namespaceChanged) resetProjectForRuntimeSwitch();
      agent.reconnect();
    }
    return res.ok;
  };

  if (!config) return null;

  const mode = config.mode;
  const distros = detect?.distros ?? [];
  const wslAvailable = detect?.available ?? false;
  const selectedDistro = config.distro ?? distros[0] ?? '';
  const status = unifiedStatus(mode, supStatus, agent.status);
  const statusText =
    status.labelKey === 'agent.status.failed'
      ? t(status.labelKey, { error: agent.error ?? '' })
      : t(status.labelKey);

  // Config-priority drift (unify-wsl-distro-source), WSL only: the user's config
  // is authoritative; `agent.distro` is the actual running distro.
  const settled = supStatus.state === 'healthy' || supStatus.state === 'adopted';
  const drift: { kind: 'mismatch' | 'unknown'; configured: string; actual: string } | null =
    mode === 'wsl'
      ? agent.distro
        ? agent.distro !== (config.distro ?? '')
          ? { kind: 'mismatch', configured: config.distro ?? '—', actual: agent.distro }
          : null
        : settled
          ? { kind: 'unknown', configured: config.distro ?? '—', actual: '' }
          : null
      : null;

  const selectMode = (next: RuntimeKind) => {
    if (next === mode) return;
    // Switching to WSL with no distro yet picks the first detected one.
    const distro = next === 'wsl' ? (config.distro ?? distros[0]) : config.distro;
    void (async () => {
      // Managed modes lock the endpoint host to loopback. Reset it on the switch
      // (e.g. coming from remote, whose endpoint points at a remote host) so the
      // supervisor's health probe targets the locally-spawned sidecar instead of
      // the stale remote address — otherwise the switch never reaches Healthy
      // until the user separately clicks 「应用」.
      if (next !== 'remote') {
        const p = port.trim() || '7821';
        await setAgentEndpoint(`http://127.0.0.1:${p}`);
      }
      await applyRuntime({ ...config, mode: next, distro });
    })();
  };

  const changeDistro = (distro: string) => {
    void applyRuntime({ ...config, distro });
  };

  // The single 「应用」 action. Commits the staged endpoint (managed: loopback +
  // port; remote: the full address) then re-drives the supervisor with the
  // current config. Always available — the only path to a manual restart when
  // nothing else is dirty.
  const apply = async () => {
    setEndpointErr(null);
    let nextEndpoint: string;
    if (mode === 'remote') {
      nextEndpoint = remoteEndpoint.trim();
    } else {
      // Validate the managed-mode port before constructing the endpoint.
      const trimmedPort = port.trim();
      if (!trimmedPort) {
        setEndpointErr(t('settings.runtime.portRequired'));
        return;
      }
      const portNum = parseInt(trimmedPort, 10);
      if (!/^\d+$/.test(trimmedPort) || portNum < 1 || portNum > 65535) {
        setEndpointErr(t('settings.runtime.portOutOfRange'));
        return;
      }
      nextEndpoint = `http://127.0.0.1:${trimmedPort}`;
    }
    const epRes = await setAgentEndpoint(nextEndpoint);
    if (!epRes.ok) {
      setEndpointErr(epRes.error.message);
      return;
    }
    const saved = await getAgentEndpoint();
    if (saved.ok) {
      setRemoteEndpoint(saved.value);
      setPort(portOf(saved.value));
    }
    const ok = await applyRuntime({
      ...config,
      serveCmdOverride: override.trim() === '' ? undefined : override.trim(),
    });
    if (ok) {
      toast({ message: t('toast.settingsSaved'), level: 'success' });
      setJustApplied(true);
      if (justAppliedTimer.current) clearTimeout(justAppliedTimer.current);
      justAppliedTimer.current = setTimeout(() => setJustApplied(false), 2000);
    }
  };

  const placeholder =
    mode === 'wsl'
      ? 'workhorse-agent serve --host 127.0.0.1 --port 7821'
      : '/path/to/workhorse-agent serve --host 127.0.0.1 --port 7821';

  const applyLabel = justApplied
    ? t('settings.endpointSaved')
    : mode === 'remote'
      ? t('settings.reconnect')
      : t('settings.runtime.applyRestart');

  return (
    <div>
      <p className="text-[11.5px] font-semibold text-on-surface-muted dark:text-on-canvas-dark-muted tracking-wider mb-4">
        {t('settings.runtime.title')}
      </p>

      {/* Single source axis: 原生 always; WSL only when detected; 远程 always. */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <RuntimeOption
          label={t('settings.runtime.native')}
          description={t('settings.runtime.nativeDescription')}
          active={mode === 'native'}
          disabled={false}
          onClick={() => selectMode('native')}
        />
        <RuntimeOption
          label={t('settings.runtime.wsl')}
          description={
            wslAvailable ? t('settings.runtime.wslDescription') : t('settings.runtime.wslUnavailable')
          }
          active={mode === 'wsl'}
          disabled={!wslAvailable}
          onClick={() => selectMode('wsl')}
        />
        <RuntimeOption
          label={t('settings.runtime.remote')}
          description={t('settings.runtime.remoteDescription')}
          active={mode === 'remote'}
          disabled={false}
          onClick={() => selectMode('remote')}
        />
      </div>

      {/* Single derived status: supervisor in managed modes, auto-connect in remote. */}
      <div className="flex items-center gap-2.5 mb-4">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${TONE_DOT[status.tone]}`} />
        <span className="text-[12.5px] font-medium text-on-surface dark:text-on-canvas-dark">
          {statusText}
        </span>
        {status.runtimeKey && (
          <span className="text-[10.5px] text-on-surface-muted dark:text-on-canvas-dark-muted">
            · {t(status.runtimeKey)}
          </span>
        )}
        {status.reason && (
          <span className="text-[10.5px] text-on-surface-muted dark:text-on-canvas-dark-muted truncate">{status.reason}</span>
        )}
      </div>

      {/* Runtime/config drift notice — WSL config-priority: prompt re-align. */}
      {drift && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2">
          <span className="text-[11.5px] text-on-surface dark:text-on-canvas-dark">
            {drift.kind === 'unknown'
              ? t('settings.runtime.driftUnknown')
              : t('settings.runtime.driftMismatch', { configured: drift.configured, actual: drift.actual })}
          </span>
        </div>
      )}

      {/* Distro dropdown — WSL only. */}
      {mode === 'wsl' && wslAvailable && (
        <div className="mb-4">
          <label className="block text-[11px] text-on-surface-muted dark:text-on-canvas-dark-muted mb-1.5">{t('settings.runtime.distro')}</label>
          <DistroSelect distros={distros} selected={selectedDistro} onChange={changeDistro} />
        </div>
      )}

      {/* Remote address — full endpoint editable. Managed modes hide this. */}
      {mode === 'remote' ? (
        <div className="mb-2">
          <label className="block text-[11px] text-on-surface-muted dark:text-on-canvas-dark-muted mb-1.5">{t('settings.endpoint')}</label>
          <input
            type="text"
            value={remoteEndpoint}
            spellCheck={false}
            onChange={(e) => {
              setRemoteEndpoint(e.target.value);
              setEndpointErr(null);
            }}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === 'Enter') void apply();
            }}
            placeholder="http://192.168.1.50:7821"
            className="w-full rounded-md border border-outline/40 bg-surface-muted px-3 py-2 font-mono text-[12.5px] text-on-surface outline-none focus:ring-1 focus:ring-outline-strong dark:border-outline-dark/50 dark:bg-surface-dark-muted/60 dark:text-on-canvas-dark-muted dark:focus:ring-outline-dark"
          />
          <p className="mt-1.5 flex items-start gap-1.5 rounded-lg border border-outline/40 bg-surface-muted/60 px-2.5 py-1.5 text-[10.5px] text-on-surface-muted dark:border-outline-dark/50 dark:bg-surface-dark-muted/40 dark:text-on-canvas-dark-muted">
            {t('settings.runtime.remoteNotice')}
          </p>
        </div>
      ) : (
        <>
          {/* Managed: host locked to loopback, only the port is adjustable. */}
          <div className="mb-3">
            <label className="block text-[11px] text-on-surface-muted dark:text-on-canvas-dark-muted mb-1.5">{t('settings.runtime.port')}</label>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[12px] text-on-surface-muted dark:text-on-canvas-dark-muted">127.0.0.1 :</span>
              <input
                type="text"
                inputMode="numeric"
                value={port}
                spellCheck={false}
                onChange={(e) => {
                  setPort(e.target.value.replace(/[^0-9]/g, ''));
                  setEndpointErr(null);
                }}
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing) return;
                  if (e.key === 'Enter') void apply();
                }}
                placeholder="7821"
                className="w-24 rounded-md border border-outline/40 bg-surface-muted px-3 py-2 font-mono text-[12.5px] text-on-surface outline-none focus:ring-1 focus:ring-outline-strong dark:border-outline-dark/50 dark:bg-surface-dark-muted/60 dark:text-on-canvas-dark-muted dark:focus:ring-outline-dark"
              />
            </div>
            <p className="mt-1 text-[10.5px] text-on-surface-muted dark:text-on-canvas-dark-muted">{t('settings.runtime.portHint')}</p>
          </div>

          {/* Advanced serve-command override (managed modes only). */}
          <div className="mb-2">
            <label className="block text-[11px] text-on-surface-muted dark:text-on-canvas-dark-muted mb-1.5">{t('settings.runtime.advancedCommand')}</label>
            <input
              type="text"
              value={override}
              spellCheck={false}
              onChange={(e) => setOverride(e.target.value)}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return;
                if (e.key === 'Enter') void apply();
              }}
              placeholder={placeholder}
              className="w-full rounded-md border border-outline/40 bg-surface-muted px-3 py-2 font-mono text-[12px] text-on-surface outline-none focus:ring-1 focus:ring-outline-strong dark:border-outline-dark/50 dark:bg-surface-dark-muted/60 dark:text-on-canvas-dark-muted dark:focus:ring-outline-dark"
            />
            <p className="mt-1 text-[10.5px] text-on-surface-muted dark:text-on-canvas-dark-muted">{t('settings.runtime.advancedHint')}</p>
          </div>
        </>
      )}

      {endpointErr && <p className="mb-2 text-[10.5px] text-danger">{endpointErr}</p>}

      {/* Single 「应用」 action + secondary disconnect (when connected). */}
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => void apply()}
          className="rounded-md bg-primary px-3 py-2 text-[12px] font-medium text-white transition-colors hover:bg-primary/90"
        >
          {applyLabel}
        </button>
        {agent.status === 'connected' && (
          <button
            type="button"
            onClick={() => agent.disconnect()}
            className="rounded-md border border-outline dark:border-outline-dark px-3 py-2 text-[12px] font-medium text-on-surface-muted dark:text-on-canvas-dark-muted hover:bg-surface-muted dark:hover:bg-surface-dark-muted transition-colors"
          >
            {t('settings.disconnect')}
          </button>
        )}
      </div>

      {/* Reasoning display preference — display-only, never toggles thinking on
          the sidecar (whether thinking runs is decided by the sidecar config). */}
      <div className="mt-6 pt-4 border-t border-outline/40 dark:border-outline-dark/40">
        <p className="text-[11.5px] font-semibold text-on-surface-muted dark:text-on-canvas-dark-muted tracking-wider mb-3">{t('settings.reasoningDisplay')}</p>
        <button
          type="button"
          role="switch"
          aria-checked={autoExpandReasoning}
          onClick={() => setAutoExpandReasoning(!autoExpandReasoning)}
          className="w-full flex items-center justify-between gap-3"
        >
          <span className="text-left">
            <span className="block text-[12.5px] font-medium text-on-surface dark:text-on-canvas-dark">{t('settings.autoExpandThinking')}</span>
            <span className="block text-[10.5px] text-on-surface-muted dark:text-on-canvas-dark-muted mt-0.5">{t('settings.autoExpandDescription')}</span>
          </span>
          <span className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${autoExpandReasoning ? 'bg-primary' : 'bg-canvas dark:bg-outline-dark'}`}>
            <span className={`inline-block h-4 w-4 transform rounded-full bg-surface dark:bg-surface-dark shadow transition-transform ${autoExpandReasoning ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </span>
        </button>
      </div>
    </div>
  );
}

/** Parse the port from an endpoint URL for the managed-mode port field; falls
 *  back to the documented default when absent/unparseable. Uses the browser's
 *  URL API to stay aligned with the Rust-side `port_from_endpoint` parser. */
function portOf(endpoint: string): string {
  try {
    const url = new URL(endpoint);
    if (url.port) return url.port;
    // Default port for the scheme (e.g. 80 for http) — prefer the sidecar default.
    return '7821';
  } catch {
    return '7821';
  }
}

/** A single runtime-mode choice card (Native / WSL). */
function RuntimeOption({
  label,
  description,
  active,
  disabled,
  onClick,
}: {
  label: string;
  description: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      disabled={disabled}
      onClick={onClick}
      className={`flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? 'border-primary bg-surface-muted dark:border-primary dark:bg-surface-dark-muted/60'
          : 'border-outline/40 hover:border-outline dark:border-outline-dark/50 dark:hover:border-outline-dark'
      }`}
    >
      <span className="text-[12.5px] font-medium text-on-surface dark:text-on-canvas-dark">{label}</span>
      <span className="text-[10.5px] text-on-surface-muted dark:text-on-canvas-dark-muted">{description}</span>
    </button>
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
      <p className="text-[11.5px] font-semibold text-on-surface-muted dark:text-on-canvas-dark-muted tracking-wider mb-4">{t('settings.appearance')}</p>
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
      <div className="mt-4 pt-4 border-t border-outline/40 dark:border-outline-dark/40">
        <label className="block text-[11px] text-on-surface-muted dark:text-on-canvas-dark-muted mb-1.5">
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
        className="flex w-full items-center justify-between gap-2 rounded-md border border-outline/40 bg-surface-muted px-3 py-2 text-[12.5px] text-on-surface transition-colors hover:bg-surface-muted dark:border-outline-dark/50 dark:bg-surface-dark-muted/60 dark:text-on-canvas-dark-muted dark:hover:bg-surface-dark-muted"
      >
        <span>{current.label}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 flex-shrink-0 text-on-surface-muted transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="absolute left-0 right-0 z-50 mt-1 overflow-hidden rounded-lg border border-outline bg-surface py-1 shadow-lg dark:border-outline-dark dark:bg-surface-dark-elevated">
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
                <Check className="h-3.5 w-3.5 flex-shrink-0 text-on-surface-muted dark:text-on-canvas-dark-muted" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * WSL distro picker. Same visual pattern as `LanguageSelect` — a trigger button
 * with a rotating chevron and a floating popover with a check mark on the
 * active item.
 */
function DistroSelect({
  distros,
  selected,
  onChange,
}: {
  distros: string[];
  selected: string;
  onChange: (distro: string) => void;
}) {
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

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-outline/40 bg-surface-muted px-3 py-2 text-[12.5px] text-on-surface transition-colors hover:bg-surface-muted dark:border-outline-dark/50 dark:bg-surface-dark-muted/60 dark:text-on-canvas-dark-muted dark:hover:bg-surface-dark-muted"
      >
        <span>{selected}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 flex-shrink-0 text-on-surface-muted transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="absolute left-0 right-0 z-50 mt-1 overflow-hidden rounded-lg border border-outline bg-surface py-1 shadow-lg dark:border-outline-dark dark:bg-surface-dark-elevated">
          {distros.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => {
                onChange(d);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between px-3 py-1.5 text-left text-[13px] text-on-surface transition-colors hover:bg-surface-muted dark:text-on-canvas-dark dark:hover:bg-surface-dark-muted"
            >
              <span>{d}</span>
              {d === selected && (
                <Check className="h-3.5 w-3.5 flex-shrink-0 text-on-surface-muted dark:text-on-canvas-dark-muted" />
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
      className={`flex flex-col items-center gap-2.5 py-5 rounded-lg border-2 transition-all duration-150 ${
        active
          ? 'border-primary dark:border-primary bg-surface-muted dark:bg-surface-dark-muted/80'
          : 'border-outline dark:border-outline-dark hover:border-outline-strong dark:hover:border-outline-dark hover:bg-surface-muted/60 dark:hover:bg-surface-dark-muted/30'
      }`}
    >
      <span className={active ? 'text-on-surface dark:text-on-canvas-dark' : 'text-on-surface-muted dark:text-on-canvas-dark-muted'}>
        {icon}
      </span>
      <span className={`text-[12.5px] font-medium ${active ? 'text-on-surface dark:text-on-canvas-dark' : 'text-on-surface-muted dark:text-on-canvas-dark-muted'}`}>
        {label}
      </span>
    </button>
  );
}

function ShortcutsSection() {
  const { t } = useTranslation();

  return (
    <div>
      <p className="text-[11.5px] font-semibold text-on-surface-muted dark:text-on-canvas-dark-muted tracking-wider mb-4">{t('settings.keyboardShortcuts')}</p>
      <div className="grid grid-cols-2 gap-x-8 gap-y-0">
        {SHORTCUTS.map(({ key, descKey }) => (
          <div
            key={key}
            className="flex items-center justify-between py-2 border-b border-outline/30 dark:border-outline-dark/50"
          >
            <span className="text-[12.5px] text-on-surface-muted dark:text-on-canvas-dark-muted">{t(descKey)}</span>
            <kbd className="px-1.5 py-0.5 rounded-md bg-surface-muted dark:bg-surface-dark-muted border border-outline/60 dark:border-outline-dark text-[11px] font-mono text-on-surface dark:text-on-canvas-dark-muted flex-shrink-0">
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

/** Last path segment of a project workdir, for the compact Project column
 *  (handles POSIX and Windows separators). The full path shows on hover. */
function projectLabel(workdir: string): string {
  const trimmed = workdir.replace(/[/\\]+$/, '');
  const idx = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  return idx >= 0 ? trimmed.slice(idx + 1) || trimmed : trimmed;
}

/** Format a date string as relative time in the current locale. */
function relativeTime(date: string, t: ReturnType<typeof useTranslation>['t'], language: string): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  if (isNaN(then)) return '—';
  const diffMs = now - then;
  const diffSec = Math.round(diffMs / 1000);
  const diffMin = Math.round(diffSec / 60);
  const diffHr = Math.round(diffMin / 60);
  const diffDay = Math.round(diffHr / 24);

  if (diffSec < 60) return t('relativeTime.justNow');
  if (diffMin < 60) return t('relativeTime.minutesAgo', { count: diffMin });
  if (diffHr < 24) return t('relativeTime.hoursAgo', { count: diffHr });
  if (diffDay === 1) return t('relativeTime.yesterday');
  if (diffDay < 7) return t('relativeTime.daysAgo', { count: diffDay });
  return new Date(then).toLocaleDateString(language === 'zh-CN' ? 'zh-CN' : 'en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function SessionsSection() {
  const { t, i18n } = useTranslation();
  const confirm = useConfirm();
  const toast = useToast();
  const { fetchAllSessions, renameSession, deleteSession } = useSession();

  // Cross-project view: every project's persisted sessions (not just the active
  // project's switcher list). Refetched after rename/delete since those mutate
  // the active-project list, not this one (decouple-project-from-launch-cwd).
  const [allRows, setAllRows] = useState<AgentSessionMeta[]>([]);
  const refreshRows = useCallback(async () => {
    setAllRows(await fetchAllSessions());
  }, [fetchAllSessions]);
  useEffect(() => {
    void refreshRows();
  }, [refreshRows]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');

  const renameEndedRef = useRef(false);

  // Hooks must be called unconditionally (React rules-of-hooks). doDelete is a
  // useCallback that used to sit after the early return; moved here so the hook
  // count is stable across renders regardless of the data being empty or not.
  const doDelete = useCallback(async (id: string) => {
    if (deletingId) return; // already deleting something
    const confirmed = await confirm({
      title: t('sessions.delete'),
      body: t('sessions.confirmDeleteOne'),
      danger: true,
      confirmText: t('agent.confirmDelete'),
    });
    if (!confirmed) return;
    setDeletingId(id);
    const ok = await deleteSession(id);
    setDeletingId(null);
    if (ok) {
      toast({ message: t('sessions.deletedMessage', { count: 1 }), level: 'success' });
      void refreshRows();
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } else {
      toast({ message: t('common.retry'), level: 'error' });
    }
  }, [deleteSession, t, deletingId, refreshRows, confirm, toast]);

  // Sort by updatedAt descending (most recently modified first).
  const sorted = allRows && allRows.length > 0
    ? [...allRows].sort((a, b) => {
        const da = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const db = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return db - da;
      })
    : [];

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <div className="text-[11.5px] font-semibold text-on-surface-muted dark:text-on-canvas-dark-muted tracking-wider mb-4">
          {t('sessions.title')}
        </div>
        <div className="text-[12.5px] text-on-surface-muted dark:text-on-canvas-dark-muted mb-1">
          {t('sessions.empty.title')}
        </div>
        <div className="text-[11px] text-on-surface-muted/70 dark:text-on-canvas-dark-muted/70">
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
      if (ok) {
        toast({ message: t('toast.renamed'), level: 'success' });
        void refreshRows();
      } else {
        toast({ message: t('common.retry'), level: 'error' });
      }
    }
    setRenamingId(null);
  };

  const cancelRename = () => {
    renameEndedRef.current = true;
    setRenamingId(null);
  };

  // doDelete moved above the early return (see hook-stability comment).

  const confirmBatchDelete = async () => {
    if (deletingId) return;
    const ok = await confirm({
      title: t('sessions.deleteSelected', { count: selected.size }),
      body: t('sessions.confirmBatchDelete', { count: selected.size }),
      danger: true,
      confirmText: t('agent.confirmDelete'),
    });
    if (!ok) return;
    setDeletingId('__batch__');
    const ids = [...selected];
    let failed = 0;
    for (const id of ids) {
      const ok = await deleteSession(id);
      if (!ok) failed++;
    }
    setDeletingId(null);
    if (failed > 0) {
      toast({ message: `${t('sessions.deletedMessage', { count: ids.length - failed })}，${t('toast.batchDeletePartial', { count: failed })}`, level: 'warning' });
    } else {
      toast({ message: t('sessions.deletedMessage', { count: ids.length }), level: 'success' });
    }
    void refreshRows();
    setSelected(new Set());
  };

  const statusKey = (status: string): 'idle' | 'running' =>
    status === 'running' ? 'running' : 'idle';

  return (
    <div>
      {/* Title row */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11.5px] font-semibold text-on-surface-muted dark:text-on-canvas-dark-muted tracking-wider">
          {t('sessions.title')}
        </p>
        <span className="text-[10.5px] text-on-surface-muted dark:text-on-canvas-dark-muted">
          {t('sessions.count', { count: sorted.length })}
        </span>
      </div>

      {/* Batch toolbar */}
      {selected.size > 0 && (
        <div className="mb-2 flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-[var(--color-surface-muted)] dark:bg-[var(--color-surface-dark-muted)]">
          <span className="text-[11px] text-on-surface-muted dark:text-on-canvas-dark-muted">
            {t('sessions.selectedCount', { selected: selected.size, total: sorted.length })}
          </span>
          <button
            type="button"
            onClick={() => void confirmBatchDelete()}
            disabled={deletingId !== null}
            className="px-2 py-0.5 rounded-md text-[10.5px] font-medium text-danger hover:bg-danger/10 transition-colors disabled:opacity-50"
          >
            {t('sessions.deleteSelected', { count: selected.size })}
          </button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border border-outline dark:border-outline-dark overflow-hidden">
        <div className="overflow-y-auto max-h-[310px] custom-scrollbar">
          <table className="w-full text-[11.5px]" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="w-10 px-2 py-2 bg-[var(--color-surface-muted)] dark:bg-[var(--color-surface-dark)] border-b border-r border-outline dark:border-outline-dark font-semibold text-left">
                  <button
                    type="button"
                    onClick={toggleAll}
                    className="p-0.5 rounded-sm text-on-surface-muted hover:text-on-surface dark:hover:text-on-canvas-dark transition-colors"
                    aria-label={t('sessions.selectAll')}
                  >
                    {allSelected ? (
                      <CheckSquare className="w-3.5 h-3.5 text-on-surface dark:text-on-canvas-dark" />
                    ) : someSelected ? (
                      <CheckSquare className="w-3.5 h-3.5 text-on-surface-muted" />
                    ) : (
                      <Square className="w-3.5 h-3.5" />
                    )}
                  </button>
                </th>
                <th className="w-28 text-left px-2.5 py-2 bg-[var(--color-surface-muted)] dark:bg-[var(--color-surface-dark)] border-b border-r border-outline dark:border-outline-dark font-semibold text-on-surface dark:text-on-canvas-dark">
                  {t('sessions.columns.project')}
                </th>
                <th className="text-left px-2.5 py-2 bg-[var(--color-surface-muted)] dark:bg-[var(--color-surface-dark)] border-b border-r border-outline dark:border-outline-dark font-semibold text-on-surface dark:text-on-canvas-dark">
                  {t('sessions.columns.title')}
                </th>
                <th className="w-16 text-left px-2.5 py-2 bg-[var(--color-surface-muted)] dark:bg-[var(--color-surface-dark)] border-b border-r border-outline dark:border-outline-dark font-semibold text-on-surface dark:text-on-canvas-dark">
                  {t('sessions.columns.status')}
                </th>
                <th className="w-14 text-right px-2.5 py-2 bg-[var(--color-surface-muted)] dark:bg-[var(--color-surface-dark)] border-b border-r border-outline dark:border-outline-dark font-semibold text-on-surface dark:text-on-canvas-dark">
                  {t('sessions.columns.messages')}
                </th>
                <th className="w-24 text-left px-2.5 py-2 bg-[var(--color-surface-muted)] dark:bg-[var(--color-surface-dark)] border-b border-r border-outline dark:border-outline-dark font-semibold text-on-surface dark:text-on-canvas-dark">
                  {t('sessions.columns.updated')}
                </th>
                <th className="w-16 px-2.5 py-2 bg-[var(--color-surface-muted)] dark:bg-[var(--color-surface-dark)] border-b border-outline dark:border-outline-dark font-semibold text-on-surface dark:text-on-canvas-dark">
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
                        className="p-0.5 rounded-sm text-on-surface-muted hover:text-on-surface dark:hover:text-on-canvas-dark transition-colors"
                      >
                        {isSelected ? (
                          <CheckSquare className="w-3.5 h-3.5 text-on-surface dark:text-on-canvas-dark" />
                        ) : (
                          <Square className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </td>

                    {/* Project */}
                    <td className="px-2.5 py-2 border-r border-outline/50 dark:border-outline-dark/50">
                      <span
                        className="truncate max-w-[110px] block font-mono text-[10.5px] text-on-surface-muted dark:text-on-canvas-dark-muted"
                        title={s.workdir}
                      >
                        {projectLabel(s.workdir)}
                      </span>
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
                          className="w-full rounded-md border border-outline bg-surface px-2 py-0.5 text-[11.5px] text-on-surface outline-none focus:ring-1 focus:ring-outline-strong dark:border-outline-dark dark:bg-surface-dark dark:text-on-canvas-dark dark:focus:ring-outline-dark"
                        />
                      ) : (
                        <span
                          className={`truncate max-w-[200px] block ${
                            s.title
                              ? 'text-on-surface dark:text-on-canvas-dark'
                              : 'text-on-surface-muted dark:text-on-canvas-dark-muted italic'
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
                            st === 'running' ? 'bg-success animate-pulse' : 'bg-on-surface-muted'
                          }`}
                        />
                        <span className="text-[10.5px] text-on-surface-muted dark:text-on-canvas-dark-muted">
                          {t(`sessions.status.${st}`)}
                        </span>
                      </span>
                    </td>

                    {/* Message count */}
                    <td className="px-2.5 py-2 text-right text-[10.5px] text-on-surface-muted dark:text-on-canvas-dark-muted tabular-nums border-r border-outline/50 dark:border-outline-dark/50">
                      {s.messageCount ?? 0}
                    </td>

                    {/* Updated time */}
                    <td className="px-2.5 py-2 text-[10.5px] text-on-surface-muted dark:text-on-canvas-dark-muted whitespace-nowrap border-r border-outline/50 dark:border-outline-dark/50">
                      {s.updatedAt ? relativeTime(s.updatedAt, t, i18n.language) : '—'}
                    </td>

                    {/* Actions */}
                    <td className="px-2.5 py-2">
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          aria-label={t('sessions.rename')}
                          disabled={deletingId !== null}
                          onClick={() => openRename(s.id, s.title)}
                          className="p-1 rounded-sm text-on-surface-muted hover:text-on-surface dark:hover:text-on-canvas-dark hover:bg-canvas/70 dark:hover:bg-surface-dark-muted transition-colors disabled:opacity-40"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          aria-label={t('sessions.delete')}
                          disabled={deletingId !== null}
                          onClick={() => void doDelete(s.id)}
                          className={`p-1 rounded-sm transition-colors disabled:opacity-40 ${
                            deletingId === s.id
                              ? 'text-danger cursor-wait'
                              : 'text-on-surface-muted hover:text-danger hover:bg-danger/10'
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
