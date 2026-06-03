/**
 * Per-session SSE subscription. A faithful port of the streaming logic that used
 * to live in `AgentRail`'s effect, but parameterized by `sessionId` and writing
 * through injected setters so the **store** can keep listeners mounted for every
 * live session — not just the visible one (add-project-sessions D2 / §3.3).
 *
 * The renderer still subscribes to the same `agent://…/{sessionId}` Tauri events
 * relayed by the Rust bridge; only the destination of the parsed state changed.
 */

import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { ChatMessage, MessagePart, SessionScratch } from './types';
import { dropPending, isPendingOnly } from './types';

export interface SessionEventSink {
  /** Mutate this session's message list. */
  setMessages: (updater: (prev: ChatMessage[]) => ChatMessage[]) => void;
  /** Mutate this session's streaming-id set. */
  setStreaming: (updater: (prev: Set<string>) => Set<string>) => void;
  /** Mutable streaming scratch (assistant id + accumulated delta). */
  scratch: SessionScratch;
  /** Update this session's display title (sidecar derived it from the first
   *  user message). Optional — omit to ignore live title updates. */
  setTitle?: (title: string) => void;
  /** Called when the session's SSE reader gave up (`connection_failed`). The
   *  store uses this to re-open the *same* session (re-spawn the Rust reader)
   *  rather than mint a new one. Optional — omit to ignore stream drops. */
  onConnectionFailed?: () => void;
  /** Called when the sidecar compacts context for this session. The store
   *  uses this to show a transient indicator in the chat header. */
  onCompaction?: () => void;
  /** Called when the provider returns a retryable error (rate limit, overload).
   *  The store uses this to show a transient retry indicator. */
  onProviderRetry?: () => void;
  /** Called when output resumes after a retry (first text/reasoning event).
   *  The store uses this to clear the retry indicator. */
  onOutputResumed?: () => void;
}

const newAssistantId = () => `a-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

/**
 * Subscribe to all `agent://…/{sessionId}` events and stream them into the sink.
 * Returns the array of unlisten fns; the caller unsubscribes on teardown.
 */
export async function subscribeSession(
  sessionId: string,
  sink: SessionEventSink,
): Promise<UnlistenFn[]> {
  const { setMessages, setStreaming, scratch, setTitle, onConnectionFailed } = sink;
  const unlistens: UnlistenFn[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const on = async (event: string, handler: (e: any) => void) => {
    unlistens.push(await listen(event, handler));
  };

  // --- text delta ---
  await on(`agent://text/${sessionId}`, (e: { payload: { delta: string } }) => {
    const wasEmpty = scratch.delta === '';
    if (!scratch.assistantId) {
      scratch.assistantId = newAssistantId();
      scratch.delta = '';
      setStreaming((prev) => new Set(prev).add(scratch.assistantId));
    }
    scratch.delta += e.payload.delta;
    if (wasEmpty && scratch.delta !== '') sink.onOutputResumed?.();
    const id = scratch.assistantId;
    const content = scratch.delta;
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === 'assistant' && last.id === id) {
        const hasText = last.parts.some((p) => p.type === 'text');
        const parts = hasText
          ? last.parts.map((p) => (p.type === 'text' ? { ...p, content } : p))
          : [...last.parts, { type: 'text' as const, content }];
        return [...prev.slice(0, -1), { ...last, parts }];
      }
      return [...prev, { id, role: 'assistant', parts: [{ type: 'text', content }] }];
    });
  });

  // --- text done ---
  await on(`agent://textdone/${sessionId}`, () => {
    const id = scratch.assistantId;
    if (id) setStreaming((prev) => { const n = new Set(prev); n.delete(id); return n; });
    scratch.assistantId = '';
    scratch.delta = '';
    setMessages((prev) => prev.filter((m) => !isPendingOnly(m)));
  });

  // --- tool call start (camelCase from Rust) ---
  await on(`agent://toolstart/${sessionId}`, (e: { payload: { toolCallId: string; name: string; input: unknown } }) => {
    const tcId = e.payload.toolCallId;
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === 'assistant') {
        const parts = [...dropPending(last.parts), { type: 'tool_call' as const, id: tcId, name: e.payload.name, input: e.payload.input, status: 'running' as const }];
        return [...prev.slice(0, -1), { ...last, parts }];
      }
      const newId = newAssistantId();
      if (!scratch.assistantId) {
        scratch.assistantId = newId;
        scratch.delta = '';
        setStreaming((s) => new Set(s).add(newId));
      }
      return [...prev, { id: newId, role: 'assistant', parts: [{ type: 'tool_call', id: tcId, name: e.payload.name, input: e.payload.input, status: 'running' as const }] }];
    });
  });

  // --- tool call done ---
  await on(`agent://tooldone/${sessionId}`, (e: { payload: { toolCallId: string; output?: unknown; error?: string; ok?: boolean; tookMs?: number } }) => {
    const tcId = e.payload.toolCallId;
    setMessages((prev) => prev.map((msg) => {
      if (msg.role !== 'assistant') return msg;
      return {
        ...msg,
        parts: msg.parts.map((p) =>
          p.type === 'tool_call' && p.id === tcId
            ? { ...p, status: e.payload.error ? ('error' as const) : ('done' as const), output: e.payload.output ?? e.payload.error }
            : p),
      };
    }));
  });

  // --- reasoning start ---
  await on(`agent://reasoning_start/${sessionId}`, (e: { payload: { reasoningType: string } }) => {
    sink.onOutputResumed?.();
    if (!scratch.assistantId) {
      scratch.assistantId = newAssistantId();
      scratch.delta = '';
      setStreaming((prev) => new Set(prev).add(scratch.assistantId));
    }
    const id = scratch.assistantId;
    const redacted = e.payload.reasoningType === 'redacted';
    const part: MessagePart = { type: 'reasoning', text: '', status: 'streaming', redacted, startedAt: Date.now() };
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === 'assistant' && last.id === id) {
        return [...prev.slice(0, -1), { ...last, parts: [...dropPending(last.parts), part] }];
      }
      return [...prev, { id, role: 'assistant', parts: [part] }];
    });
  });

  // --- reasoning delta ---
  await on(`agent://reasoning_delta/${sessionId}`, (e: { payload: { delta: string } }) => {
    const id = scratch.assistantId;
    if (!id) return;
    setMessages((prev) => prev.map((msg) => {
      if (msg.role !== 'assistant' || msg.id !== id) return msg;
      const parts = [...msg.parts];
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        if (p.type === 'reasoning' && p.status === 'streaming') {
          parts[i] = { ...p, text: p.text + e.payload.delta };
          break;
        }
      }
      return { ...msg, parts };
    }));
  });

  // --- reasoning end ---
  await on(`agent://reasoning_end/${sessionId}`, () => {
    const id = scratch.assistantId;
    if (!id) return;
    setMessages((prev) => prev.map((msg) => {
      if (msg.role !== 'assistant' || msg.id !== id) return msg;
      const parts = [...msg.parts];
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        if (p.type === 'reasoning' && p.status === 'streaming') {
          parts[i] = { ...p, status: 'done', endedAt: Date.now() };
          break;
        }
      }
      return { ...msg, parts };
    }));
  });

  // --- error ---
  await on(`agent://error/${sessionId}`, (e: { payload: { code: string; message: string; recoverable: boolean } }) => {
    scratch.assistantId = '';
    scratch.delta = '';
    setStreaming(() => new Set());
    const { code, message } = e.payload;
    setMessages((prev) => [
      ...prev.filter((m) => !isPendingOnly(m)),
      { id: `e-${Date.now()}`, role: 'assistant', parts: [{ type: 'error', code, message }] },
    ]);
  });

  // --- permission request (authoritative prompt only, carries `dangerous`) ---
  await on(`agent://permission_request/${sessionId}`, (e: { payload: { requestId: string; tool: string; resource: string; dangerous: boolean; reason: string } }) => {
    const { requestId, tool, resource, dangerous, reason } = e.payload;
    setMessages((prev) => {
      if (prev.some((m) => m.parts.some((p) => p.type === 'permission' && p.requestId === requestId))) return prev;
      const part: MessagePart = { type: 'permission', requestId, tool, resource, dangerous, reason, status: 'pending' };
      const base = prev.filter((m) => !isPendingOnly(m));
      const last = base[base.length - 1];
      if (last?.role === 'assistant') {
        return [...base.slice(0, -1), { ...last, parts: [...dropPending(last.parts), part] }];
      }
      return [...base, { id: `p-${Date.now()}`, role: 'assistant', parts: [part] }];
    });
  });

  // --- title derived (sidecar named the session from its first message) ---
  if (setTitle) {
    await on(`agent://session_title/${sessionId}`, (e: { payload: { title: string } }) => {
      if (e.payload.title) setTitle(e.payload.title);
    });
  }

  // --- connection failed (SSE reader gave up after its bounded retries) ---
  if (onConnectionFailed) {
    await on(`agent://connection_failed/${sessionId}`, () => onConnectionFailed());
  }

  // --- subagent event (subagent lifecycle, forwarded raw) ---
  await on(`agent://subagent_event/${sessionId}`, (e: { payload: { name?: string; status?: string; [key: string]: unknown } }) => {
    const name = e.payload.name ?? 'subagent';
    const status = (['started', 'completed', 'error'].includes(e.payload.status ?? '') ? e.payload.status : 'started') as 'started' | 'completed' | 'error';
    setMessages((prev) => {
      // If a subagent entry with this name already exists, update its status;
      // otherwise append a new system-message-style entry.
      const existingIdx = prev.findIndex((m) => m.role === 'assistant' && m.parts.some((p) => p.type === 'subagent' && p.name === name));
      if (existingIdx >= 0) {
        return prev.map((m, i) => i === existingIdx
          ? { ...m, parts: m.parts.map((p) => p.type === 'subagent' && p.name === name ? { ...p, status } : p) }
          : m);
      }
      const entry: ChatMessage = { id: `sub-${Date.now()}`, role: 'assistant', parts: [{ type: 'subagent', name, status }] };
      return [...prev, entry];
    });
  });

  // --- compaction (context compression completed) ---
  await on(`agent://compaction/${sessionId}`, () => {
    sink.onCompaction?.();
  });

  // --- provider retry (rate-limit / overload backoff) ---
  await on(`agent://provider_retry/${sessionId}`, () => {
    sink.onProviderRetry?.();
  });

  // --- interrupted (user-cancelled turn) ---
  await on(`agent://interrupted/${sessionId}`, () => {
    const id = scratch.assistantId;
    scratch.assistantId = '';
    scratch.delta = '';
    setStreaming((prev) => { const n = new Set(prev); if (id) n.delete(id); return n; });
    setMessages((prev) => {
      // When id is known, match by id directly. When id is empty (interrupted
      // before any text/tool event arrived), fall back to the *last* assistant
      // message that has actual content — skip subagent-only entries which are
      // metadata, not the turn the user expects to see marked as interrupted.
      let fallbackIdx = -1;
      if (id === '') {
        for (let i = prev.length - 1; i >= 0; i--) {
          const m = prev[i];
          if (m.role === 'assistant' && !m.parts.every((p) => p.type === 'subagent')) {
            fallbackIdx = i;
            break;
          }
        }
      }
      const targetIdx = id !== '' ? -1 : fallbackIdx;
      return prev.map((m, i) => {
        if (m.role === 'assistant' && (m.id === id || i === targetIdx)) {
          return {
            ...m,
            interrupted: true,
            parts: m.parts.map((p) => p.type === 'reasoning' && p.status === 'streaming' ? { ...p, status: 'done' as const, endedAt: Date.now() } : p),
          };
        }
        return m;
      }).filter((m) => !isPendingOnly(m));
    });
  });

  return unlistens;
}
