import { useCallback, useEffect, useRef, useState } from 'react';
import { attachAgentSession, detachAgentSession } from './agent';

/**
 * Activates the agent bridge from the UI (the entry point that turns the
 * otherwise-dormant `src/ipc/agent.ts` client into a live loop).
 *
 * Connection is **explicit** (design D4: the bridge attaches to a sidecar the
 * user is already running, it never spawns one). `connect()` calls
 * `attachAgentSession()` — which allocates a sidecar session, subscribes to its
 * `tool_use` stream, and publishes the current tool catalog. A failure (e.g. no
 * sidecar listening) surfaces as `status:'error'` with the message, rather than
 * throwing.
 */
export type AgentStatus = 'idle' | 'connecting' | 'connected' | 'error';

export interface AgentConnection {
  status: AgentStatus;
  sessionId: string | null;
  error: string | null;
  connect: () => void;
  disconnect: () => void;
}

export function useAgentConnection(): AgentConnection {
  const [status, setStatus] = useState<AgentStatus>('idle');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Guard against overlapping connect attempts and post-unmount setState.
  const busy = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // Best-effort teardown so a remount starts from a clean session.
      void detachAgentSession();
    };
  }, []);

  const connect = useCallback(() => {
    if (busy.current) return;
    busy.current = true;
    setStatus('connecting');
    setError(null);
    void attachAgentSession()
      .then((res) => {
        if (!mounted.current) return;
        if (res.ok) {
          setSessionId(res.value);
          setStatus('connected');
        } else {
          setError(res.error.message);
          setStatus('error');
        }
      })
      .finally(() => {
        busy.current = false;
      });
  }, []);

  const disconnect = useCallback(() => {
    void detachAgentSession().finally(() => {
      if (!mounted.current) return;
      setSessionId(null);
      setError(null);
      setStatus('idle');
    });
  }, []);

  return { status, sessionId, error, connect, disconnect };
}
