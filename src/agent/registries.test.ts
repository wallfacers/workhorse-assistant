import { afterEach, describe, expect, it } from 'vitest';
import {
  registerAction,
  executeAction,
  actionCatalog,
  __resetActions,
} from './actionRegistry';
import {
  registerState,
  executeState,
  stateCatalog,
  __resetStates,
} from './stateRegistry';
import { ToolError } from './contract';

const NULL_SCHEMA = { type: 'null' } as const;
const EMPTY_OBJ = { type: 'object', properties: {} } as const;

afterEach(() => {
  __resetActions();
  __resetStates();
});

describe('actionRegistry', () => {
  it('registers, executes, and returns a success envelope', async () => {
    let ran = false;
    registerAction(
      { name: 'do_it', description: 'd', inputSchema: EMPTY_OBJ, outputSchema: NULL_SCHEMA },
      () => {
        ran = true;
        return null;
      },
    );
    const result = await executeAction('do_it', {});
    expect(ran).toBe(true);
    expect(result).toEqual({ ok: true, value: null });
  });

  it('returns not_found for an unregistered action (never throws)', async () => {
    const result = await executeAction('ghost', {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('not_found');
  });

  it('maps a thrown exception to internal', async () => {
    registerAction(
      { name: 'boom', description: 'd', inputSchema: EMPTY_OBJ, outputSchema: NULL_SCHEMA },
      () => {
        throw new Error('stale ref');
      },
    );
    const result = await executeAction('boom', {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('internal');
      expect(result.error.message).toBe('stale ref');
    }
  });

  it('preserves the kind of a thrown ToolError', async () => {
    registerAction(
      { name: 'nope', description: 'd', inputSchema: EMPTY_OBJ, outputSchema: NULL_SCHEMA },
      () => {
        throw new ToolError('forbidden', 'not allowed');
      },
    );
    const result = await executeAction('nope', {});
    if (!result.ok) expect(result.error.kind).toBe('forbidden');
  });

  it('unregister removes the action', async () => {
    const off = registerAction(
      { name: 'temp', description: 'd', inputSchema: EMPTY_OBJ, outputSchema: NULL_SCHEMA },
      () => null,
    );
    off();
    const result = await executeAction('temp', {});
    if (!result.ok) expect(result.error.kind).toBe('not_found');
  });

  it('advertises actions as parallel-unsafe', () => {
    registerAction(
      { name: 'a', description: 'd', inputSchema: EMPTY_OBJ, outputSchema: NULL_SCHEMA },
      () => null,
    );
    expect(actionCatalog()[0].parallelSafety).toBe('unsafe');
  });
});

describe('stateRegistry', () => {
  it('registers and reads a snapshot', async () => {
    registerState(
      { name: 'count', description: 'd', inputSchema: EMPTY_OBJ, outputSchema: { type: 'number' } },
      () => 42,
    );
    const result = await executeState('count', {});
    expect(result).toEqual({ ok: true, value: 42 });
  });

  it('returns not_found for an unregistered reader', async () => {
    const result = await executeState('ghost', {});
    if (!result.ok) expect(result.error.kind).toBe('not_found');
  });

  it('advertises readers as parallel-safe', () => {
    registerState(
      { name: 's', description: 'd', inputSchema: EMPTY_OBJ, outputSchema: { type: 'number' } },
      () => 1,
    );
    expect(stateCatalog()[0].parallelSafety).toBe('safe');
  });
});
