import { useCallback, useEffect, useRef, useState } from 'react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { attachAgentSession, checkAgentHealth, detachAgentSession } from './agent';
import { isTauri } from './runtime';
import i18n from '../i18n';

/**
 * Auto-connect hook: on mount, probes `GET /health` to verify the sidecar is
 * a compatible workhorse-agent, then attaches. If unreachable, retries with
 * exponential backoff (1 s → 30 s cap). Three failure modes:
 *
 *   1. **Unreachable** (`transient`) → retry with backoff.
 *   2. **Incompatible** (`internal: incompatible`) → stop, surface error.
 *   3. **Manual disconnect** → paused, no retry until `reconnect()`.
 *
 * After connecting, two health-monitoring layers keep the status dot accurate:
 *
 *   **Layer 1 (Rust events)**: the SSE reader thread emits
 *   `connection_lost` / `connection_restored` / `connection_failed` events
 *   that this hook listens for, giving instant feedback when the stream drops.
 *
 *   **Layer 2 (heartbeat)**: a 30 s periodic `checkAgentHealth()` call
 *   catches cases where the Rust events are lost or the thread is stuck.
 *
 * In non-Tauri mode (browser dev server), auto-connect is skipped entirely.
 */
export type AgentStatus = 'idle' | 'connecting' | 'connected' | 'error';

export interface AgentConnection {
  status: AgentStatus;
  sessionId: string | null;
  error: string | null;
  /** Manual disconnect — pauses auto-retry. */
  disconnect: () => void;
  /** Resume auto-connect after a manual disconnect. */
  reconnect: () => void;
}

const MAX_RETRY_DELAY_MS = 30_000;
const HEARTBEAT_INTERVAL_MS = 30_000;

export function useAgentConnection(): AgentConnection {
  const [status, setStatus] = useState<AgentStatus>('idle');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Guards
  const busy = useRef(false);
  const mounted = useRef(true);
  const pausedRef = useRef(false);
  const attemptRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Layer 1: Rust connection lifecycle event unlisteners.
  const unlistenConnRef = useRef<UnlistenFn[]>([]);
  // Layer 2: heartbeat timer.
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Indirect ref for scheduleRetry — avoids circular useCallback deps.
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

  const clearConnListeners = useCallback(() => {
    unlistenConnRef.current.forEach((fn) => fn());
    unlistenConnRef.current = [];
  }, []);

  /** Kick off the Layer 2 heartbeat timer (only when connected). */
  const startHeartbeat = useCallback(() => {
    clearHeartbeat();
    heartbeatRef.current = setInterval(() => {
      if (!mounted.current || pausedRef.current) return;
      void (async () => {
        try {
          const health = await checkAgentHealth();
          if (!mounted.current) return;
          if (!health.ok) {
            setError(health.error.message);
            setStatus('error');
            clearHeartbeat();
            scheduleRetryRef.current();
          }
        } catch {
          if (!mounted.current) return;
          setError(i18n.t('agent.status.heartbeatFailed'));
          setStatus('error');
          clearHeartbeat();
          scheduleRetryRef.current();
        }
      })();
    }, HEARTBEAT_INTERVAL_MS);
  }, [clearHeartbeat]);

  // Stable reference to tryConnect so the retry timer and mount effect can
  // call it without stale closures. We rebuild via useCallback when the
  // clearRetry dependency changes (it doesn't — stable).
  const tryConnect = useCallback(() => {
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
        // 1. Probe
        const health = await checkAgentHealth();
        if (!mounted.current || pausedRef.current) return;
        if (!health.ok) {
          // Incompatible or protocol error — stop retrying
          setError(health.error.message);
          setStatus('error');
          return;
        }

        // 2. Attach
        const res = await attachAgentSession();
        if (!mounted.current || pausedRef.current) return;
        if (res.ok) {
          setSessionId(res.value);
          setStatus('connected');
          setError(null);
          attemptRef.current = 0; // reset backoff on success
        } else {
          setError(res.error.message);
          setStatus('error');
          scheduleRetryRef.current();
        }
      } catch (e) {
        if (!mounted.current) return;
        setError(e instanceof Error ? e.message : String(e));
        setStatus('error');
        scheduleRetryRef.current();
      } finally {
        busy.current = false;
      }
    })();
  }, [clearRetry]);

  const scheduleRetry = useCallback(() => {
    if (pausedRef.current || !mounted.current) return;
    const delay = Math.min(1000 * Math.pow(2, attemptRef.current), MAX_RETRY_DELAY_MS);
    attemptRef.current++;
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      if (!pausedRef.current && mounted.current) tryConnect();
    }, delay);
  }, [tryConnect]);

  // Wire the indirect ref so startHeartbeat can call scheduleRetry without
  // creating a circular useCallback dependency chain.
  scheduleRetryRef.current = scheduleRetry;

  const disconnect = useCallback(() => {
    pausedRef.current = true;
    clearRetry();
    clearHeartbeat();
    clearConnListeners();
    void detachAgentSession().finally(() => {
      if (!mounted.current) return;
      setSessionId(null);
      setError(null);
      setStatus('idle');
    });
  }, [clearRetry, clearHeartbeat, clearConnListeners]);

  const reconnect = useCallback(() => {
    pausedRef.current = false;
    attemptRef.current = 0;
    tryConnect();
  }, [tryConnect]);

  // --- Layer 1: subscribe to Rust connection lifecycle events when connected ---
  useEffect(() => {
    const sid = sessionId;
    if (status !== 'connected' || !sid || !isTauri()) {
      // Not connected — ensure listeners are cleaned up.
      clearConnListeners();
      return;
    }

    let cancelled = false;

    const topics = [
      {
        event: `agent://connection_lost/${sid}`,
        handler: () => {
          if (!mounted.current || cancelled) return;
          setStatus('connecting');
          setError(null);
          clearHeartbeat(); // pause heartbeat while Rust retries
        },
      },
      {
        event: `agent://connection_restored/${sid}`,
        handler: () => {
          if (!mounted.current || cancelled) return;
          setStatus('connected');
          setError(null);
          startHeartbeat(); // restart heartbeat after restore
        },
      },
      {
        event: `agent://connection_failed/${sid}`,
        handler: () => {
          if (!mounted.current || cancelled) return;
          setError(i18n.t('agent.status.reconnecting'));
          setStatus('error');
          clearHeartbeat();
          // SSE reader thread exited — full reconnect cycle needed.
          reconnect();
        },
      },
    ];

    Promise.all(
      topics.map(({ event, handler }) => listen(event, handler)),
    ).then((fns) => {
      if (cancelled) {
        fns.forEach((fn) => fn());
        return;
      }
      unlistenConnRef.current = fns;
    });

    // Start Layer 2 heartbeat.
    startHeartbeat();

    return () => {
      cancelled = true;
      clearConnListeners();
      clearHeartbeat();
    };
  }, [status, sessionId, clearConnListeners, clearHeartbeat, startHeartbeat, reconnect]);

  // --- Mount / unmount ---
  useEffect(() => {
    mounted.current = true;
    // Kick off auto-connect on mount
    tryConnect();
    return () => {
      mounted.current = false;
      clearRetry();
      clearHeartbeat();
      clearConnListeners();
      void detachAgentSession();
    };
  }, [tryConnect, clearRetry, clearHeartbeat, clearConnListeners]);

  return { status, sessionId, error, disconnect, reconnect };
}
