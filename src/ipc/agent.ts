import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { ok, toIpcError, type Result } from './result';
import { isTauri } from './runtime';
import {
  Dispatcher,
  buildCatalog,
  publishedTopic,
  setCatalogPublisher,
  toolUseTopic,
  type CatalogPublishResult,
  type CatalogPublishedPayload,
  type ToolCatalogEntry,
  type ToolResultEnvelope,
  type ToolUsePayload,
} from '../agent';

/**
 * Renderer-side bridge client for the agent UI control surface (task 3.7).
 *
 * Owns the renderer half of segment 1 (renderer ↔ Rust): it subscribes to the
 * per-session `agent://tooluse/{sessionId}` Tauri event, feeds payloads through
 * the {@link Dispatcher} (which orders actions by `seq` and runs readers
 * concurrently), and forwards each result back upstream via the
 * `agent_forward_result` command. It also wires `republishCatalog()` to the
 * `agent_publish_catalog` command for the attached session.
 *
 * The renderer makes no direct network call to the sidecar — every byte to the
 * Go agent crosses through these Rust commands (the `AGENTS.md` boundary).
 *
 * V1 manages a single attached session. Re-attaching detaches the previous one.
 */

interface ActiveSession {
  sessionId: string;
  unlisten: UnlistenFn;
  unlistenPublished: UnlistenFn;
  dispatcher: Dispatcher;
  /** Last `frontend_tools_published` outcome seen for this session, or null
   *  before the first publish round-trips. */
  lastPublish: CatalogPublishResult | null;
}

let active: ActiveSession | null = null;

const notInTauri = () =>
  ({ ok: false, error: { kind: 'validation', message: 'agent bridge invoked outside Tauri runtime' } }) as const;

/**
 * Attach to a sidecar agent session: the Rust bridge creates it upstream
 * (`POST /v1/sessions` with `{provider, model, workdir}`) and returns its id.
 * `workdir` is the current project dir; empty lets the Rust side default to the
 * app process cwd. On success we subscribe to the session's `frontend_tool_use`
 * stream and its async `frontend_tools_published` outcome, wire the catalog
 * publisher, then publish the current catalog.
 */
export async function attachAgentSession(workdir = ''): Promise<Result<string>> {
  if (!isTauri()) return notInTauri();
  // Tear down any prior session first (single-session V1).
  await detachAgentSession();
  try {
    const sessionId = await invoke<string>('agent_attach', { workdir });

    const dispatcher = new Dispatcher((payload, result) => {
      void forwardResult(payload.sessionId, payload.toolUseId, result);
    });

    const unlisten = await listen<ToolUsePayload>(
      toolUseTopic(sessionId),
      (e) => dispatcher.ingest(e.payload),
    );

    // The publish outcome arrives asynchronously (the POST only acks 202); stash
    // the latest registered/rejected breakdown for the session.
    const unlistenPublished = await listen<CatalogPublishedPayload>(
      publishedTopic(sessionId),
      (e) => {
        if (active && active.sessionId === sessionId) {
          active.lastPublish = {
            registered: e.payload.registered,
            rejected: e.payload.rejected,
          };
        }
      },
    );

    active = {
      sessionId,
      unlisten,
      unlistenPublished,
      dispatcher,
      lastPublish: null,
    };

    // Wire publish for this session, then push the current catalog upstream.
    setCatalogPublisher((catalog) => publishCatalog(sessionId, catalog));
    await publishCatalog(sessionId, buildCatalog());

    return ok(sessionId);
  } catch (e) {
    return { ok: false, error: toIpcError(e) };
  }
}

/** The latest publish outcome (registered/rejected) for the active session, or
 *  null before the first `frontend_tools_published` event arrives. */
export function lastPublishResult(): CatalogPublishResult | null {
  return active?.lastPublish ?? null;
}

/** Detach the active session: unsubscribe, drop the publisher, tell Rust. */
export async function detachAgentSession(): Promise<Result<void>> {
  if (!active) return ok(undefined);
  const { sessionId, unlisten, unlistenPublished, dispatcher } = active;
  active = null;
  setCatalogPublisher(null);
  unlisten();
  unlistenPublished();
  dispatcher.reset(sessionId);
  if (!isTauri()) return ok(undefined);
  try {
    await invoke('agent_detach', { sessionId });
    return ok(undefined);
  } catch (e) {
    return { ok: false, error: toIpcError(e) };
  }
}

/** Forward one `tool_result` upstream, correlated by `tool_use_id`. */
async function forwardResult(
  sessionId: string,
  toolUseId: string,
  result: ToolResultEnvelope,
): Promise<void> {
  if (!isTauri()) return;
  try {
    await invoke('agent_forward_result', { sessionId, toolUseId, result });
  } catch {
    // The agent's tool timeout covers a dropped result (design risk:
    // app-shutdown / transport drop). Nothing actionable in the renderer.
  }
}

/**
 * Publish (or re-publish) a catalog for a session via the Rust bridge. Used as
 * the {@link CatalogPublisher} wired in `attachAgentSession`. The command acks
 * once the upstream POST returns 202; the registered/rejected outcome arrives
 * later on the published event (see {@link lastPublishResult}).
 */
async function publishCatalog(
  sessionId: string,
  catalog: ToolCatalogEntry[],
): Promise<void> {
  if (!isTauri()) return;
  await invoke('agent_publish_catalog', { sessionId, catalog });
}
