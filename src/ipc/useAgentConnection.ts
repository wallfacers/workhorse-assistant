import { useCallback, useEffect, useRef, useState } from 'react';
import { attachAgentSession, checkAgentHealth, detachAgentSession } from './agent';
import { isTauri } from './runtime';

/**
 * Auto-connect hook: on mount, probes `GET /health` to verify the sidecar is
 * a compatible workhorse-agent, then attaches. If unreachable, retries with
 * exponential backoff (1 s → 30 s cap). Three failure modes:
 *
 *   1. **Unreachable** (`transient`) → retry with backoff.
 *   2. **Incompatible** (`internal: incompatible`) → stop, surface error.
 *   3. **Manual disconnect** → paused, no retry until `reconnect()`.
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

  const clearRetry = useCallback(() => {
    if (retryTimerRef.current !== null) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

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
          scheduleRetry();
        }
      } catch (e) {
        if (!mounted.current) return;
        setError(e instanceof Error ? e.message : String(e));
        setStatus('error');
        scheduleRetry();
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

  const disconnect = useCallback(() => {
    pausedRef.current = true;
    clearRetry();
    void detachAgentSession().finally(() => {
      if (!mounted.current) return;
      setSessionId(null);
      setError(null);
      setStatus('idle');
    });
  }, [clearRetry]);

  const reconnect = useCallback(() => {
    pausedRef.current = false;
    attemptRef.current = 0;
    tryConnect();
  }, [tryConnect]);

  useEffect(() => {
    mounted.current = true;
    // Kick off auto-connect on mount
    tryConnect();
    return () => {
      mounted.current = false;
      clearRetry();
      void detachAgentSession();
    };
  }, [tryConnect, clearRetry]);

  return { status, sessionId, error, disconnect, reconnect };
}
