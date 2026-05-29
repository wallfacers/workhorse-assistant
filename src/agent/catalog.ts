/**
 * Session tool catalog assembly (task 2.5).
 *
 * `buildCatalog()` merges every registered action and state reader (plus the
 * built-in `data-testid` fallbacks) into a single list of catalog entries with
 * unique names. `republishCatalog()` pushes the current catalog upstream so the
 * agent's view of the session's tool surface tracks the live UI.
 *
 * Trigger is **manual** (design D7): components call `republishCatalog()` from
 * their mount/unmount effects after (de)registering tools. Re-publishing
 * replaces the session's frontend tool set.
 *
 * The actual transport lives in the bridge client (`src/ipc/agent.ts`); this
 * module calls it through an injected publisher so the control surface does not
 * depend on the IPC layer directly.
 */

import { actionCatalog } from './actionRegistry';
import { stateCatalog } from './stateRegistry';
import type { ToolCatalogEntry } from './contract';

/**
 * Assemble the catalog from the live registries. Throws if two tools share a
 * name (a programming error — an action and a reader must not collide).
 */
export function buildCatalog(): ToolCatalogEntry[] {
  const entries = [...actionCatalog(), ...stateCatalog()];
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.name)) {
      throw new Error(`duplicate tool name in catalog: ${entry.name}`);
    }
    seen.add(entry.name);
  }
  return entries;
}

/**
 * Pushes a catalog upstream. Resolves once the publish is acknowledged (202);
 * the per-entry registered/rejected breakdown is **not** a return value — it
 * arrives asynchronously on the session's `frontend_tools_published` event
 * (see `publishedTopic` / `CatalogPublishedPayload`).
 */
export type CatalogPublisher = (catalog: ToolCatalogEntry[]) => Promise<void>;

let publisher: CatalogPublisher | null = null;

/**
 * Wire the transport. The bridge client calls this once it has an attached
 * session; before that, `republishCatalog()` is a no-op.
 */
export function setCatalogPublisher(fn: CatalogPublisher | null): void {
  publisher = fn;
}

/**
 * Assemble and publish the current catalog. No-op when no publisher is wired —
 * e.g. running in a plain browser or before a session is attached — so
 * components can call it unconditionally. The publish outcome (registered /
 * rejected) is delivered asynchronously via the session's published event, not
 * returned here.
 */
export async function republishCatalog(): Promise<void> {
  if (!publisher) return;
  await publisher(buildCatalog());
}
