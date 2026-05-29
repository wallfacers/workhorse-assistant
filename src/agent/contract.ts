/**
 * Agent ↔ UI control-surface wire contract (single source of truth).
 *
 * This file defines the types shared across all three cooperating layers of
 * the `agent-ui-control` change:
 *   - the TS control surface (`src/agent/*`, this repo),
 *   - the Rust bridge (`src-tauri/src/agent/*`, this repo, mirrors these shapes),
 *   - the workhorse-agent proxy/frontend tool class (separate Go repo).
 *
 * The Go side implements against the documented contract
 * (`openspec/changes/agent-ui-control/specs/`), so any change here is a
 * cross-repo coordination point — keep it minimal and explicit.
 */

import type { IpcError, IpcErrorKind, Result } from '../ipc/result';

// ---------------------------------------------------------------------------
// Tool catalog (1.1)
// ---------------------------------------------------------------------------

/**
 * A JSON Schema fragment. We do not model the full spec — tools carry hand-
 * authored schemas and the agent forwards them to the model verbatim. `{type:
 * "null"}` is the conventional output schema for a void action.
 */
export type JsonSchema = Record<string, unknown>;

/**
 * Whether the agent's orchestrator may batch this tool with others in a single
 * turn. Actions (state-mutating) are `unsafe` and serialize; state readers
 * (side-effect-free) are `safe` and may run concurrently. See design D5.
 */
export type ParallelSafety = 'safe' | 'unsafe';

/**
 * One entry in the session tool catalog the renderer publishes to the agent.
 * `inputSchema` describes the tool's parameters; `outputSchema` describes the
 * shape of `value` in a successful result envelope.
 */
export interface ToolCatalogEntry {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  /** Advertised to the Go orchestrator so it batches safe readers only. */
  parallelSafety: ParallelSafety;
}

/**
 * The result of executing a frontend tool. Reuses the IPC `Result<T>` shape so
 * the agent loop handles UI failures exactly like any other tool failure; the
 * bridge maps `{ok:false}` to an `is_error` tool_result. `value` is `unknown`
 * because each tool's output shape is described by its `outputSchema`, not the
 * static type system.
 */
export type ToolResultEnvelope = Result<unknown>;

/**
 * Thrown by a tool handler to fail with a specific `IpcErrorKind` while keeping
 * the happy path simple (handlers otherwise just return their raw `value`).
 * The registries map a thrown `ToolError` to `{ok:false, error:{kind, message}}`
 * preserving the kind (e.g. `forbidden` vs `not_found`, which drive different
 * agent retries — design D6); any other thrown value maps to `internal`.
 */
export class ToolError extends Error {
  constructor(
    public readonly kind: IpcErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'ToolError';
  }
}

export type { IpcError };

// ---------------------------------------------------------------------------
// Bridge payloads (1.2)
// ---------------------------------------------------------------------------

/**
 * Downstream `tool_use` relayed from the sidecar to the renderer as the Tauri
 * event `agent://tooluse/{sessionId}`.
 *
 * `seq` is a bridge-assigned monotonic counter, per session. Tauri event
 * delivery order is not guaranteed, so the renderer MUST order actions by
 * `seq` and never by arrival (design D3).
 *
 * `sessionId` is the sidecar-allocated agent session id (from `POST
 * /v1/sessions`), distinct from PTY ids (design D4).
 */
export interface ToolUsePayload {
  sessionId: string;
  seq: number;
  toolUseId: string;
  name: string;
  input: unknown;
}

/**
 * Upstream `tool_result` the renderer hands back to the bridge, which POSTs it
 * to the sidecar correlated by `toolUseId`.
 */
export interface ToolResultPayload {
  sessionId: string;
  toolUseId: string;
  result: ToolResultEnvelope;
}

/**
 * The Tauri event topic carrying downstream `tool_use` for a session, mirroring
 * PTY's verified `pty://output/{session_id}` convention.
 */
export const toolUseTopic = (sessionId: string): string =>
  `agent://tooluse/${sessionId}`;

/**
 * The Tauri event topic carrying the async `frontend_tools_published` outcome
 * for a session. A publish POST is acked with 202 and no body; the agent
 * delivers the registered/rejected breakdown as a server event, which the Rust
 * bridge relays here (see {@link CatalogPublishedPayload}).
 */
export const publishedTopic = (sessionId: string): string =>
  `agent://published/${sessionId}`;

/**
 * Per-entry outcome of publishing a catalog. The bridge/Go side rejects entries
 * whose name collides with a server-side tool (server-side retained) and
 * reports them here; non-colliding entries still register (design D7, spec
 * `agent-frontend-tools`).
 */
export interface CatalogPublishResult {
  registered: string[];
  rejected: { name: string; reason: string }[];
}

/**
 * Payload of `agent://published/{sessionId}` — the async result of a
 * `publish_frontend_tools`, relayed from the agent's `frontend_tools_published`
 * server event. The Rust bridge normalises empty sets to `[]`.
 */
export interface CatalogPublishedPayload extends CatalogPublishResult {
  sessionId: string;
}
