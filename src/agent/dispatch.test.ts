import { afterEach, describe, expect, it } from 'vitest';
import { registerAction, __resetActions } from './actionRegistry';
import { registerState, __resetStates } from './stateRegistry';
import { Dispatcher } from './dispatch';
import type { ToolResultEnvelope, ToolUsePayload } from './contract';

const SESSION = 'sess-1';

function payload(seq: number, name: string, input: unknown = {}): ToolUsePayload {
  return { sessionId: SESSION, seq, toolUseId: `tu-${seq}`, name, input };
}

const NULL_SCHEMA = { type: 'null' } as const;
const EMPTY_OBJ = { type: 'object', properties: {} } as const;

/** A dispatcher whose responses can be awaited up to `expected` count. */
function collecting(expected: number) {
  const results: { id: string; result: ToolResultEnvelope }[] = [];
  let resolve!: () => void;
  const done = new Promise<void>((r) => {
    resolve = r;
  });
  const dispatcher = new Dispatcher((p, result) => {
    results.push({ id: p.toolUseId, result });
    if (results.length >= expected) resolve();
  });
  return { dispatcher, results, done };
}

afterEach(() => {
  __resetActions();
  __resetStates();
});

describe('Dispatcher', () => {
  it('serializes actions in seq order even when they arrive out of order', async () => {
    const order: number[] = [];
    registerAction(
      { name: 'act', description: 'd', inputSchema: EMPTY_OBJ, outputSchema: NULL_SCHEMA },
      async (input) => {
        const n = (input as { n: number }).n;
        // Yield so a naive implementation would interleave.
        await Promise.resolve();
        order.push(n);
        return null;
      },
    );

    const { dispatcher, done } = collecting(3);
    // Arrive 2, 0, 1 — out of order.
    dispatcher.ingest(payload(2, 'act', { n: 2 }));
    dispatcher.ingest(payload(0, 'act', { n: 0 }));
    dispatcher.ingest(payload(1, 'act', { n: 1 }));
    await done;

    expect(order).toEqual([0, 1, 2]);
  });

  it('does not block a reader behind an in-flight action', async () => {
    const completion: string[] = [];
    let releaseAction!: () => void;
    const actionGate = new Promise<void>((r) => {
      releaseAction = r;
    });

    registerAction(
      { name: 'slow', description: 'd', inputSchema: EMPTY_OBJ, outputSchema: NULL_SCHEMA },
      async () => {
        await actionGate; // stays in-flight until released
        completion.push('action');
        return null;
      },
    );
    registerState(
      { name: 'fast', description: 'd', inputSchema: EMPTY_OBJ, outputSchema: { type: 'number' } },
      () => {
        completion.push('reader');
        return 1;
      },
    );

    const { dispatcher, done } = collecting(2);
    dispatcher.ingest(payload(0, 'slow'));
    dispatcher.ingest(payload(1, 'fast'));

    // Let the reader resolve while the action is still gated.
    await Promise.resolve();
    await Promise.resolve();
    expect(completion).toEqual(['reader']);

    releaseAction();
    await done;
    expect(completion).toEqual(['reader', 'action']);
  });

  it('routes unknown tool names to a not_found result', async () => {
    const { dispatcher, results, done } = collecting(1);
    dispatcher.ingest(payload(0, 'does_not_exist'));
    await done;
    expect(results[0].result.ok).toBe(false);
    if (!results[0].result.ok) {
      expect(results[0].result.error.kind).toBe('not_found');
    }
  });
});
