import { useCallback, useEffect, useRef, useState } from 'react';
import { checkAgentHealth } from './agent';
import { isTauri } from './runtime';
import i18n from '../i18n';

/**
 * Auto-connect hook: a **pure health probe** for the sidecar (D-WSL-4 / B3). It
 * answers exactly one question — "is a compatible workhorse-agent reachable?" —
 * and nothing about sessions. Session lifecycle (bootstrap creation, per-session
 * stream reconnect) lives in `SessionProvider`, which keys off `status`.
 *
 * On mount it probes `GET /health`; three outcomes:
 *
 *   1. **Reachable & compatible** → `connected`.
 *   2. **Unreachable** (`transient`) → `connecting`, retry with exponential
 *      backoff (1 s → 30 s cap).
 *   3. **Incompatible** (`internal`) → `error`, stop (no retry).
 *
 * While connected, a 30 s heartbeat re-probes `/health`; a failure drops back to
 * `error` and schedules a retry. A manual `disconnect()` pauses the probe (no
 * retry) until `reconnect()`.
 *
 * It does NOT attach a session, hold a `sessionId`, or listen to per-session
 * connection events — those are `SessionProvider`'s concern. In non-Tauri mode
 * (browser dev server) the probe is skipped entirely.
 */
export type AgentStatus = 'idle' | 'connecting' | 'connected' | 'error';

export interface AgentConnection {
  status: AgentStatus;
  error: string | null;
  /** Manual disconnect — pauses auto-retry/heartbeat. */
  disconnect: () => void;
  /** Resume probing after a manual disconnect (or force a re-probe). */
  reconnect: () => void;
}

const MAX_RETRY_DELAY_MS = 30_000;
const HEARTBEAT_INTERVAL_MS = 30_000;

export function useAgentConnection(): AgentConnection {
  const [status, setStatus] = useState<AgentStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  // Guards
  const busy = useRef(false);
  const mounted = useRef(true);
  const pausedRef = useRef(false);
  const attemptRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Indirect ref for scheduleRetry — avoids a circular useCallback dep chain.
  const scheduleRetryRef = useRef<() => void>(() => {});

  const clearRetry = useCallback(() => {
    if (retryTimerRef.current !== null) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const clearHeartbeat = useCallback(() => {
    if (heartbeatRef.current !== null) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  }, []);

  /** Kick off the heartbeat timer (only while connected). */
  const startHeartbeat = useCallback(() => {
    clearHeartbeat();
    heartbeatRef.current = setInterval(() => {
      if (!mounted.current || pausedRef.current) return;
      void (async () => {
        try {
          const health = await checkAgentHealth();
          if (!mounted.current || pausedRef.current) return;
          if (!health.ok) {
            setError(health.error.message);
            setStatus('error');
            clearHeartbeat();
            scheduleRetryRef.current();
          }
        } catch {
          if (!mounted.current || pausedRef.current) return;
          setError(i18n.t('agent.status.heartbeatFailed'));
          setStatus('error');
          clearHeartbeat();
          scheduleRetryRef.current();
        }
      })();
    }, HEARTBEAT_INTERVAL_MS);
  }, [clearHeartbeat]);

  // Probe /health once. Stable across renders (no changing deps).
  const probe = useCallback(() => {
    if (busy.current || pausedRef.current || !mounted.current) return;
    if (!isTauri()) {
      pausedRef.current = true;
      return;
    }
    busy.current = true;
    setStatus('connecting');
    setError(null);

    void (async () => {
      try {
        const health = await checkAgentHealth();
        if (!mounted.current || pausedRef.current) return;
        if (health.ok) {
          setStatus('connected');
          setError(null);
          attemptRef.current = 0; // reset backoff on success
          startHeartbeat();
        } else {
          setError(health.error.message);
          setStatus('error');
          // Unreachable (`transient`) → retry with backoff; incompatible
          // (`internal`) → stop and leave the error surfaced.
          if (health.error.kind === 'transient') scheduleRetryRef.current();
        }
      } catch (e) {
        if (!mounted.current || pausedRef.current) return;
        setError(e instanceof Error ? e.message : String(e));
        setStatus('error');
        scheduleRetryRef.current();
      } finally {
        busy.current = false;
      }
    })();
  }, [startHeartbeat]);

  const scheduleRetry = useCallback(() => {
    if (pausedRef.current || !mounted.current) return;
    const delay = Math.min(1000 * Math.pow(2, attemptRef.current), MAX_RETRY_DELAY_MS);
    attemptRef.current++;
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      if (!pausedRef.current && mounted.current) probe();
    }, delay);
  }, [probe]);

  // Wire the indirect ref so the heartbeat can schedule a retry without a
  // circular useCallback dependency.
  scheduleRetryRef.current = scheduleRetry;

  const disconnect = useCallback(() => {
    pausedRef.current = true;
    clearRetry();
    clearHeartbeat();
    if (!mounted.current) return;
    setError(null);
    setStatus('idle');
  }, [clearRetry, clearHeartbeat]);

  const reconnect = useCallback(() => {
    pausedRef.current = false;
    attemptRef.current = 0;
    clearRetry();
    probe();
  }, [clearRetry, probe]);

  // --- Mount / unmount ---
  useEffect(() => {
    mounted.current = true;
    probe();
    return () => {
      mounted.current = false;
      clearRetry();
      clearHeartbeat();
    };
  }, [probe, clearRetry, clearHeartbeat]);

  return { status, error, disconnect, reconnect };
}
