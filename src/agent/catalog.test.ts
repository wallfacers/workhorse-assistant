import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerAction, __resetActions } from './actionRegistry';
import { registerState, __resetStates } from './stateRegistry';
import {
  buildCatalog,
  republishCatalog,
  setCatalogPublisher,
} from './catalog';
import type { ToolCatalogEntry } from './contract';

const NULL_SCHEMA = { type: 'null' } as const;
const EMPTY_OBJ = { type: 'object', properties: {} } as const;

afterEach(() => {
  __resetActions();
  __resetStates();
  setCatalogPublisher(null);
});

describe('buildCatalog', () => {
  it('merges actions and readers with unique names', () => {
    registerAction(
      { name: 'open_tab', description: 'd', inputSchema: EMPTY_OBJ, outputSchema: NULL_SCHEMA },
      () => null,
    );
    registerState(
      { name: 'get_open_tabs', description: 'd', inputSchema: EMPTY_OBJ, outputSchema: { type: 'array' } },
      () => [],
    );
    const names = buildCatalog().map((e) => e.name).sort();
    expect(names).toEqual(['get_open_tabs', 'open_tab']);
  });

  it('throws if an action and a reader share a name', () => {
    registerAction(
      { name: 'dup', description: 'd', inputSchema: EMPTY_OBJ, outputSchema: NULL_SCHEMA },
      () => null,
    );
    registerState(
      { name: 'dup', description: 'd', inputSchema: EMPTY_OBJ, outputSchema: NULL_SCHEMA },
      () => null,
    );
    expect(() => buildCatalog()).toThrow(/duplicate tool name/);
  });
});

describe('republishCatalog', () => {
  it('is a no-op when no publisher is wired', async () => {
    expect(await republishCatalog()).toBeUndefined();
  });

  it('publishes the current catalog and reflects re-publish after changes', async () => {
    // The publisher is fire-and-forget (the registered/rejected outcome arrives
    // asynchronously over the published event, not as a return value).
    const publisher = vi.fn(async (_catalog: ToolCatalogEntry[]) => {});
    setCatalogPublisher(publisher);

    const off = registerAction(
      { name: 'a', description: 'd', inputSchema: EMPTY_OBJ, outputSchema: NULL_SCHEMA },
      () => null,
    );
    await republishCatalog();
    expect(publisher).toHaveBeenLastCalledWith([
      expect.objectContaining({ name: 'a' }),
    ]);

    // Unregister and re-publish: the catalog now excludes 'a'.
    off();
    await republishCatalog();
    expect(publisher).toHaveBeenLastCalledWith([]);
  });
});
