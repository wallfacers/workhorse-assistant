/**
 * Tool-use dispatcher (design D5, task 2.4).
 *
 * Receives downstream `tool_use` payloads — which may arrive out of order
 * because Tauri event delivery order is not guaranteed — and routes them to the
 * registries with two invariants:
 *
 *   1. **Actions serialize in `seq` order.** They run one at a time, strictly
 *      ascending by the bridge-assigned `seq`, never by arrival order.
 *   2. **Readers never block.** Side-effect-free state readers fire immediately
 *      and are not delayed behind an in-flight action, so a reader observes the
 *      live state at its invocation time (spec: "Reader is not delayed by an
 *      in-flight action").
 *
 * Mechanism: a per-session reorder buffer processes the contiguous `seq` stream
 * in order. Dispatching a payload *advances* `nextSeq` immediately (it does not
 * await completion), so the stream keeps flowing. Actions are *enqueued* onto a
 * serial promise chain (serializing them); readers are *started* concurrently.
 */

import { hasAction, executeAction } from './actionRegistry';
import { executeState } from './stateRegistry';
import type { ToolResultEnvelope, ToolUsePayload } from './contract';

export type RespondFn = (
  payload: ToolUsePayload,
  result: ToolResultEnvelope,
) => void;

interface SessionState {
  /** Next contiguous seq we are allowed to dispatch. */
  nextSeq: number;
  /** Payloads that arrived ahead of `nextSeq`, keyed by seq. */
  buffer: Map<number, ToolUsePayload>;
  /** Serial promise chain for action handlers (serializes them in seq order). */
  actionTail: Promise<void>;
}

export class Dispatcher {
  private readonly sessions = new Map<string, SessionState>();

  constructor(private readonly respond: RespondFn) {}

  /** Ingest one downstream `tool_use`. Safe to call with out-of-order seqs. */
  ingest(payload: ToolUsePayload): void {
    const state = this.sessionState(payload.sessionId);
    state.buffer.set(payload.seq, payload);
    this.drain(state);
  }

  /** Dispatch every buffered payload that is now contiguous from `nextSeq`. */
  private drain(state: SessionState): void {
    for (
      let next = state.buffer.get(state.nextSeq);
      next !== undefined;
      next = state.buffer.get(state.nextSeq)
    ) {
      state.buffer.delete(state.nextSeq);
      state.nextSeq += 1;
      this.route(state, next);
    }
  }

  private route(state: SessionState, payload: ToolUsePayload): void {
    if (hasAction(payload.name)) {
      // Serial: chain onto the tail so actions never interleave. We advanced
      // nextSeq above before awaiting, so readers behind this action still
      // dispatch immediately.
      state.actionTail = state.actionTail.then(async () => {
        const result = await executeAction(payload.name, payload.input);
        this.respond(payload, result);
      });
    } else {
      // Concurrent: readers (and unknown names → not_found) run right away.
      void executeState(payload.name, payload.input).then((result) => {
        this.respond(payload, result);
      });
    }
  }

  private sessionState(sessionId: string): SessionState {
    let state = this.sessions.get(sessionId);
    if (!state) {
      state = { nextSeq: 0, buffer: new Map(), actionTail: Promise.resolve() };
      this.sessions.set(sessionId, state);
    }
    return state;
  }

  /** Forget a session's ordering state (e.g. on session teardown). */
  reset(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}
