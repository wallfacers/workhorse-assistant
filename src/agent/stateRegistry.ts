/**
 * Registry of **state-reader** tools — side-effect-free snapshots of UI state
 * (a button's enabled/visible/label, the open tabs, the active pane). Readers
 * are advertised as parallel-safe and, per design D5, observe live state at
 * invocation time: the dispatcher fires them immediately and never delays them
 * behind an in-flight action.
 *
 * Handlers MUST NOT mutate state. They may be sync or async.
 */

import { ok, err } from '../ipc/result';
import { ToolError } from './contract';
import type {
  JsonSchema,
  ToolCatalogEntry,
  ToolResultEnvelope,
} from './contract';

export interface StateDefinition {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  /** Shape of the returned snapshot `value`. */
  outputSchema: JsonSchema;
}

/** Returns a serializable snapshot; its return value becomes the `value`. */
export type StateReader = (input: unknown) => unknown | Promise<unknown>;

interface Entry {
  definition: StateDefinition;
  reader: StateReader;
}

const readers = new Map<string, Entry>();

/** Register a state reader. Returns an unregister fn (idempotent). */
export function registerState(
  definition: StateDefinition,
  reader: StateReader,
): () => void {
  readers.set(definition.name, { definition, reader });
  return () => {
    if (readers.get(definition.name)?.reader === reader) {
      readers.delete(definition.name);
    }
  };
}

/** Is `name` a registered state reader? */
export function hasState(name: string): boolean {
  return readers.has(name);
}

/**
 * Read state and return a result envelope. Never throws: a missing reader is
 * `not_found`; a reader that throws maps to `internal`.
 */
export async function executeState(
  name: string,
  input: unknown,
): Promise<ToolResultEnvelope> {
  const entry = readers.get(name);
  if (!entry) {
    return err('not_found', `no registered state reader: ${name}`);
  }
  try {
    const value = await entry.reader(input);
    return ok(value);
  } catch (e) {
    if (e instanceof ToolError) return err(e.kind, e.message);
    return err('internal', e instanceof Error ? e.message : String(e));
  }
}

/** Catalog entries for all registered readers (parallel-safe). */
export function stateCatalog(): ToolCatalogEntry[] {
  return [...readers.values()].map(({ definition }) => ({
    name: definition.name,
    description: definition.description,
    inputSchema: definition.inputSchema,
    outputSchema: definition.outputSchema,
    parallelSafety: 'safe',
  }));
}

/** Test-only: clear all registrations. */
export function __resetStates(): void {
  readers.clear();
}
