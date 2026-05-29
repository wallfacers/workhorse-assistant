/**
 * Agent UI control surface — public entry point.
 *
 * Components register actions/state here and call `republishCatalog()` after
 * (de)registering. The bridge client (`src/ipc/agent.ts`) wires the transport.
 */

export type {
  JsonSchema,
  ParallelSafety,
  ToolCatalogEntry,
  ToolResultEnvelope,
  ToolUsePayload,
  ToolResultPayload,
  CatalogPublishResult,
  CatalogPublishedPayload,
} from './contract';
export { ToolError, toolUseTopic, publishedTopic } from './contract';

export type { ActionDefinition, ActionHandler } from './actionRegistry';
export { registerAction } from './actionRegistry';

export type { StateDefinition, StateReader } from './stateRegistry';
export { registerState } from './stateRegistry';

export { registerFallbackTools, isVisible } from './fallbackTools';

export { Dispatcher } from './dispatch';
export type { RespondFn } from './dispatch';

export {
  buildCatalog,
  republishCatalog,
  setCatalogPublisher,
} from './catalog';
export type { CatalogPublisher } from './catalog';
