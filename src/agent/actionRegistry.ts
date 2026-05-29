/**
 * Registry of semantic **action** tools — state-mutating UI operations the
 * agent can invoke (open a tab, focus a pane, run a task). Actions are always
 * advertised as parallel-unsafe so the Go orchestrator serializes them; the
 * actual serialization happens in `dispatch.ts`.
 *
 * Components register on mount and call the returned unregister fn on unmount,
 * then `republishCatalog()` so the agent's view tracks the live UI (design D7).
 */

import { ok, err } from '../ipc/result';
import { ToolError } from './contract';
import type {
  JsonSchema,
  ToolCatalogEntry,
  ToolResultEnvelope,
} from './contract';

export interface ActionDefinition {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  /** Shape of the success `value`; use `{ type: 'null' }` for void actions. */
  outputSchema: JsonSchema;
}

/** May be sync or async; its return value becomes the result envelope's `value`. */
export type ActionHandler = (input: unknown) => unknown | Promise<unknown>;

interface Entry {
  definition: ActionDefinition;
  handler: ActionHandler;
}

const actions = new Map<string, Entry>();

/**
 * Register an action tool. Returns an unregister fn (idempotent) for unmount
 * cleanup. Re-registering an existing name overwrites it (last writer wins),
 * matching React remount semantics.
 */
export function registerAction(
  definition: ActionDefinition,
  handler: ActionHandler,
): () => void {
  actions.set(definition.name, { definition, handler });
  return () => {
    // Only delete if we still own the slot — guards against an unmount fn
    // clobbering a newer registration of the same name after a fast remount.
    if (actions.get(definition.name)?.handler === handler) {
      actions.delete(definition.name);
    }
  };
}

/** Is `name` a registered action? Used by the dispatcher to pick the serial path. */
export function hasAction(name: string): boolean {
  return actions.has(name);
}

/**
 * Execute an action and return a result envelope. Never throws: a missing
 * action is `not_found`; a handler that throws is caught and mapped to
 * `internal`, so a `tool_result` is always produced (spec: "Handler throws an
 * unexpected exception").
 */
export async function executeAction(
  name: string,
  input: unknown,
): Promise<ToolResultEnvelope> {
  const entry = actions.get(name);
  if (!entry) {
    return err('not_found', `no registered action: ${name}`);
  }
  try {
    const value = await entry.handler(input);
    return ok(value);
  } catch (e) {
    if (e instanceof ToolError) return err(e.kind, e.message);
    return err('internal', e instanceof Error ? e.message : String(e));
  }
}

/** Catalog entries for all registered actions (parallel-unsafe). */
export function actionCatalog(): ToolCatalogEntry[] {
  return [...actions.values()].map(({ definition }) => ({
    name: definition.name,
    description: definition.description,
    inputSchema: definition.inputSchema,
    outputSchema: definition.outputSchema,
    parallelSafety: 'unsafe',
  }));
}

/** Test-only: clear all registrations. */
export function __resetActions(): void {
  actions.clear();
}
