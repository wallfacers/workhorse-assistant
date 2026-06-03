//! Unified connection status (unify-runtime-source-panel).
//!
//! The 「运行来源」 panel shows a **single** status indicator. Its truth source
//! depends on the runtime mode, because the two underlying signals answer
//! different questions:
//!
//!   * Managed modes (`native`/`wsl`): the supervisor owns the local process, so
//!     `supervisor.status` (probing → starting → healthy/adopted/failed) is
//!     authoritative.
//!   * `remote`: there is no local process; the supervisor stays `Disabled`. The
//!     auto-connect probe (`agent.status`) is the sole liveness source (R2).
//!
//! This is a pure derivation — no React, no IO — so it is unit-testable and the
//! panel just renders the result.

import type { AgentStatus } from './useAgentConnection';
import type { RuntimeKind, SupervisorStatus } from './wsl';

/** Visual tone for the single status dot. */
export type StatusTone = 'idle' | 'pending' | 'ok' | 'error';

export interface UnifiedStatus {
  /** Dot color: idle=gray, pending=amber(pulse), ok=green, error=red. */
  tone: StatusTone;
  /** i18n key for the status label. */
  labelKey: string;
  /** Whether the dot should pulse (transitional states). */
  pulse: boolean;
  /** i18n key for the runtime suffix (`· 原生/WSL/远程`), when known. */
  runtimeKey?: string;
  /** Optional human-readable reason (supervisor `failed`, etc.). */
  reason?: string;
}

/** Map a managed-mode supervisor state to a tone. */
function supervisorTone(state: SupervisorStatus['state']): StatusTone {
  switch (state) {
    case 'healthy':
    case 'adopted':
      return 'ok';
    case 'probing':
    case 'starting':
    case 'restarting':
      return 'pending';
    case 'failed':
      return 'error';
    case 'disabled':
    default:
      return 'idle';
  }
}

/** Map a remote-mode agent status to a tone. */
function agentTone(status: AgentStatus): StatusTone {
  switch (status) {
    case 'connected':
      return 'ok';
    case 'connecting':
      return 'pending';
    case 'error':
      return 'error';
    case 'idle':
    default:
      return 'idle';
  }
}

/** Remote `agent.status` → the existing `agent.status.*` label keys (mirrors the
 *  label map the legacy connection block used). */
const AGENT_LABEL_KEY: Record<AgentStatus, string> = {
  idle: 'agent.status.disconnected',
  connecting: 'agent.status.connecting',
  connected: 'agent.status.connected',
  error: 'agent.status.failed',
};

/** Per-runtime suffix label key (`· 原生/WSL/远程`). */
const RUNTIME_KEY: Record<RuntimeKind, string> = {
  native: 'settings.runtime.native',
  wsl: 'settings.runtime.wsl',
  remote: 'settings.runtime.remote',
};

/**
 * Derive the single status shown by the unified panel. Managed modes read the
 * supervisor; `remote` reads the auto-connect probe.
 */
export function unifiedStatus(
  mode: RuntimeKind,
  supervisor: SupervisorStatus,
  agent: AgentStatus,
): UnifiedStatus {
  if (mode === 'remote') {
    const tone = agentTone(agent);
    return {
      tone,
      labelKey: AGENT_LABEL_KEY[agent],
      pulse: tone === 'pending',
      runtimeKey: RUNTIME_KEY.remote,
    };
  }
  const tone = supervisorTone(supervisor.state);
  return {
    tone,
    labelKey: `settings.runtime.state.${supervisor.state}`,
    pulse: tone === 'pending',
    // Prefer the supervisor's self-reported runtime; fall back to the mode.
    runtimeKey: RUNTIME_KEY[supervisor.runtime ?? mode],
    reason: supervisor.reason,
  };
}
