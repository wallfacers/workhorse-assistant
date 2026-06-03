/**
 * Shared chat types for the multi-session store. Moved out of `AgentRail` so the
 * store, the SSE event layer, and the view all agree on one shape (add-project-sessions §3.2).
 */

export type MessagePart =
  | { type: 'text'; content: string }
  | {
      type: 'reasoning';
      text: string;
      status: 'streaming' | 'done';
      redacted?: boolean;
      startedAt?: number;
      endedAt?: number;
    }
  | { type: 'tool_call'; id: string; name: string; input: unknown; status: 'running' | 'done' | 'error'; output?: unknown }
  | { type: 'error'; code: string; message: string }
  | {
      type: 'permission';
      requestId: string;
      tool: string;
      resource: string;
      dangerous: boolean;
      reason: string;
      status: 'pending' | 'allowed' | 'denied';
    }
  | { type: 'pending' }
  | { type: 'subagent'; name: string; status: 'started' | 'completed' | 'error' };

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  parts: MessagePart[];
  /** Set by the `interrupted` SSE event — the turn was cancelled by the user. */
  interrupted?: boolean;
}

/** Per-session live conversation buffer held in the store (one per attached
 *  session). `streaming` holds the ids of assistant messages whose turn is still
 *  in flight. */
export interface ChatRuntime {
  messages: ChatMessage[];
  streaming: Set<string>;
}

/** Mutable per-session scratch for the streaming delta buffer (not React state —
 *  it changes on every token). */
export interface SessionScratch {
  assistantId: string;
  delta: string;
}

export const emptyRuntime = (): ChatRuntime => ({ messages: [], streaming: new Set() });

/** Drop a leading `pending` placeholder when real content arrives. */
export const dropPending = (parts: MessagePart[]): MessagePart[] =>
  parts.filter((p) => p.type !== 'pending');

/** True when a message is just the first-token placeholder (no content yet). */
export const isPendingOnly = (m: ChatMessage): boolean =>
  m.role === 'assistant' && m.parts.length === 1 && m.parts[0].type === 'pending';
