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

/** All attached sessions, keyed by sidecar session id. Multi-live: switching
 *  between sessions never detaches the others — they keep streaming in the
 *  background (D2). */
const sessions = new Map<string, ActiveSession>();

/** The session that signature-less calls (`sendAgentMessage(content)`, etc.)
 *  default to. The session store sets it via `setActiveSession` when the user
 *  switches sessions. */
let currentActiveId: string | null = null;

/** Whether the fan-out catalog publisher is wired. Wired lazily on the first
 *  attach; torn down when the last session detaches. */
let publisherWired = false;

/** Publish a catalog to *every* attached session — the UI tool surface is shared
 *  across sessions, so `republishCatalog()` must reach all of them. */
function publishToAllSessions(catalog: ToolCatalogEntry[]): Promise<void> {
  return Promise.all([...sessions.keys()].map((id) => publishCatalog(id, catalog))).then(
    () => undefined,
  );
}

/** Subscribe to a session's tool-use + published streams, register its bridge
 *  state, make it the active default, and push the current catalog to it. Shared
 *  by `attachAgentSession` (after create) and `openAgentSession`. */
async function wireSession(sessionId: string): Promise<void> {
  const dispatcher = new Dispatcher((payload, result) => {
    void forwardResult(payload.sessionId, payload.toolUseId, result);
  });

  const unlisten = await listen<ToolUsePayload>(toolUseTopic(sessionId), (e) =>
    dispatcher.ingest(e.payload),
  );

  // The publish outcome arrives asynchronously (the POST only acks 202); stash
  // the latest registered/rejected breakdown on the session's entry.
  const unlistenPublished = await listen<CatalogPublishedPayload>(publishedTopic(sessionId), (e) => {
    const entry = sessions.get(sessionId);
    if (entry) {
      entry.lastPublish = { registered: e.payload.registered, rejected: e.payload.rejected };
    }
  });

  sessions.set(sessionId, {
    sessionId,
    unlisten,
    unlistenPublished,
    dispatcher,
    lastPublish: null,
  });
  currentActiveId = sessionId;

  if (!publisherWired) {
    setCatalogPublisher(publishToAllSessions);
    publisherWired = true;
  }
  await publishCatalog(sessionId, buildCatalog());
}

const notInTauri = () =>
  ({ ok: false, error: { kind: 'validation', message: 'agent bridge invoked outside Tauri runtime' } }) as const;

/** Response from GET /health, used by the auto-connect probe. */
export interface HealthInfo {
  ok: boolean;
  version: string;
  protocol_version: string;
  capabilities: string[];
  /** Human-readable reason when `ok` is false (e.g. `"no_provider_key"`).
   *  Lets the UI surface why the sidecar is degraded instead of a generic error. */
  reason?: string;
  /** Sidecar uptime in seconds. */
  uptime_sec?: number;
  /** Number of currently active (live) sessions on the sidecar. */
  sessions_active?: number;
  /** The sidecar's default project path; used for cold-start when there is no
   *  remembered project. Optional: a sidecar predating the WSL-remote batch
   *  omits it (additive, does not bump `protocol_version`). */
  default_workdir?: string;
  /** Sidecar host platform (`linux`/`windows`/`darwin`). */
  platform?: string;
  /** Linux distro name; present only when the sidecar runs under WSL. Lets the
   *  UI default the terminal to a `wsl` profile. */
  distro?: string;
}

/** Session metadata as persisted/reported by the sidecar (see
 *  `workhorse-agent-tasks.md`). `status` drives which sessions get a live stream
 *  on restart/open. Optional fields tolerate a sidecar that omits them. */
export interface AgentSessionMeta {
  id: string;
  workdir: string;
  title: string;
  status: 'idle' | 'running';
  createdAt?: string;
  updatedAt?: string;
  messageCount?: number;
  lastMessagePreview?: string;
}

/** A known project path (a sidecar `workdir`) and its session count. */
export interface AgentProjectMeta {
  path: string;
  sessionCount?: number;
  updatedAt?: string;
}

/** One entry from `GET /v1/fs/list`. `isDir` is camelCase on the wire. */
export interface FsEntry {
  name: string;
  path: string;
  isDir: boolean;
}

/** Body of `GET /v1/fs/list`: the resolved dir plus its single-level entries. */
export interface FsListing {
  path: string;
  entries: FsEntry[];
}

/** Probe the sidecar via GET /health to verify identity and compatibility. */
export async function checkAgentHealth(): Promise<Result<HealthInfo>> {
  if (!isTauri()) return notInTauri();
  try {
    const info = await invoke<HealthInfo>('agent_health_check');
    return ok(info);
  } catch (e) {
    return { ok: false, error: toIpcError(e) };
  }
}

/** Current sidecar base endpoint (for the Settings UI). */
export async function getAgentEndpoint(): Promise<Result<string>> {
  if (!isTauri()) return notInTauri();
  try {
    return ok(await invoke<string>('agent_get_endpoint'));
  } catch (e) {
    return { ok: false, error: toIpcError(e) };
  }
}

/** Update the sidecar base endpoint (B4). Validated Rust-side to a
 *  `http(s)://host[:port]` base URL; caller should `reconnect()` afterwards.
 *  Live sessions from the previous endpoint are not migrated (V1). */
export async function setAgentEndpoint(endpoint: string): Promise<Result<void>> {
  if (!isTauri()) return notInTauri();
  try {
    await invoke('agent_set_endpoint', { endpoint });
    return ok(undefined);
  } catch (e) {
    return { ok: false, error: toIpcError(e) };
  }
}

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
  try {
    // Creates a brand-new session upstream (POST /v1/sessions). Multi-live: does
    // NOT detach existing sessions — they keep running in the background (D2).
    const sessionId = await invoke<string>('agent_attach', { workdir });
    await wireSession(sessionId);
    return ok(sessionId);
  } catch (e) {
    return { ok: false, error: toIpcError(e) };
  }
}

/**
 * Subscribe to an **existing** session without creating one (`agent_open_session`).
 * Used when switching back to a previously-created session: its SSE stream is
 * re-opened and it becomes the active default, but the sidecar never allocates a
 * duplicate. If already attached, just re-activates it.
 */
export async function openAgentSession(sessionId: string): Promise<Result<void>> {
  if (!isTauri()) return notInTauri();
  if (sessions.has(sessionId)) {
    currentActiveId = sessionId;
    return ok(undefined);
  }
  try {
    await invoke('agent_open_session', { sessionId });
    await wireSession(sessionId);
    return ok(undefined);
  } catch (e) {
    return { ok: false, error: toIpcError(e) };
  }
}

/**
 * Re-spawn the Rust SSE reader for a session whose stream gave up
 * (`agent://connection_failed/{id}`). Unlike {@link openAgentSession} this does
 * NOT short-circuit when the session is already in the local map — the TS
 * listener layers stay mounted and only the Rust reader is restarted (the Rust
 * `subscribe` heals a not-alive handle). No new upstream session is created.
 */
export async function reopenAgentSession(sessionId: string): Promise<Result<void>> {
  if (!isTauri()) return notInTauri();
  try {
    await invoke('agent_open_session', { sessionId });
    return ok(undefined);
  } catch (e) {
    return { ok: false, error: toIpcError(e) };
  }
}

/** Send a user message to a session (defaults to the active one). */
export async function sendAgentMessage(
  content: string,
  sessionId: string | null = currentActiveId,
): Promise<Result<void>> {
  if (!isTauri() || !sessionId) return notInTauri();
  try {
    await invoke('agent_send_message', { sessionId, content });
    return ok(undefined);
  } catch (e) {
    return { ok: false, error: toIpcError(e) };
  }
}

/** Cancel the active agent turn (real interrupt via the sidecar cancel endpoint).
 *  Routes through the Rust `agent_cancel` command — the renderer makes no direct
 *  network call to the sidecar (AGENTS.md boundary). */
export async function cancelAgentMessage(
  sessionId: string | null = currentActiveId,
): Promise<Result<void>> {
  if (!isTauri() || !sessionId) return notInTauri();
  try {
    await invoke('agent_cancel', { sessionId });
    return ok(undefined);
  } catch (e) {
    return { ok: false, error: toIpcError(e) };
  }
}

/** Permission decision values accepted by the sidecar. */
export type PermissionDecision =
  | 'allow_once' | 'allow_session' | 'allow_permanent' | 'deny' | 'deny_permanent';

/** Answer a pending tool-permission prompt for the active session (routes
 *  through the Rust `agent_permission_decision` command). */
export async function sendPermissionDecision(
  requestId: string,
  decision: PermissionDecision,
  sessionId: string | null = currentActiveId,
): Promise<Result<void>> {
  if (!isTauri() || !sessionId) return notInTauri();
  try {
    await invoke('agent_permission_decision', { sessionId, requestId, decision });
    return ok(undefined);
  } catch (e) {
    return { ok: false, error: toIpcError(e) };
  }
}

/** The active session ID (the default for signature-less calls), or null. */
export function activeSessionId(): string | null {
  return currentActiveId;
}

/** Set the active default session (the session store calls this on switch). A
 *  null clears it; a non-attached id is ignored. */
export function setActiveSession(sessionId: string | null): void {
  if (sessionId === null || sessions.has(sessionId)) currentActiveId = sessionId;
}

/** The ids of all currently-attached (live) sessions. */
export function attachedSessionIds(): string[] {
  return [...sessions.keys()];
}

/** The latest publish outcome (registered/rejected) for a session (defaults to
 *  the active one), or null before the first `frontend_tools_published` event. */
export function lastPublishResult(
  sessionId: string | null = currentActiveId,
): CatalogPublishResult | null {
  return (sessionId ? sessions.get(sessionId)?.lastPublish : null) ?? null;
}

/** Detach one session (defaults to the active one): unsubscribe its streams,
 *  drop its bridge state, and tell Rust to stop its reader thread. Other
 *  sessions are untouched. The catalog publisher is dropped only when the last
 *  session detaches. */
export async function detachAgentSession(
  sessionId: string | null = currentActiveId,
): Promise<Result<void>> {
  if (!sessionId) return ok(undefined);
  const entry = sessions.get(sessionId);
  if (!entry) return ok(undefined);
  sessions.delete(sessionId);
  entry.unlisten();
  entry.unlistenPublished();
  entry.dispatcher.reset(sessionId);

  if (currentActiveId === sessionId) {
    const remaining = [...sessions.keys()];
    currentActiveId = remaining.length ? remaining[remaining.length - 1] : null;
  }
  if (sessions.size === 0) {
    setCatalogPublisher(null);
    publisherWired = false;
  }

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

// ---------------------------------------------------------------------------
// Project / session catalog (sidecar-persisted; the assistant never reads the
// sidecar's data directory directly — D1).
// ---------------------------------------------------------------------------

/** List persisted sessions. With a project `workdir`, the project-scoped list
 *  (`GET /v1/sessions?workdir=`); with `''` (the default), the full set across
 *  ALL projects (the sidecar treats an empty workdir as "no filter") — used by
 *  the cross-project session-management table. */
export async function listAgentSessions(workdir = ''): Promise<Result<AgentSessionMeta[]>> {
  if (!isTauri()) return notInTauri();
  try {
    const body = await invoke<{ sessions?: AgentSessionMeta[] }>('agent_list_sessions', { workdir });
    return ok(body.sessions ?? []);
  } catch (e) {
    return { ok: false, error: toIpcError(e) };
  }
}

/** List known project paths (`GET /v1/projects`). */
export async function listAgentProjects(): Promise<Result<AgentProjectMeta[]>> {
  if (!isTauri()) return notInTauri();
  try {
    const body = await invoke<{ projects?: AgentProjectMeta[] }>('agent_list_projects');
    return ok(body.projects ?? []);
  } catch (e) {
    return { ok: false, error: toIpcError(e) };
  }
}

/** Delete a project record (`DELETE /v1/projects?workdir=`). A project is a
 *  derived view (a workdir with ≥1 session), so this hard-deletes every session
 *  under `workdir` server-side; the on-disk directory is untouched. Returns the
 *  number of sessions deleted. This is a shared helper — callers gate it behind
 *  the global confirmation dialog at the UI layer, not here. */
export async function deleteAgentProject(workdir: string): Promise<Result<number>> {
  if (!isTauri()) return notInTauri();
  try {
    const body = await invoke<{ deleted?: number }>('agent_delete_project', { workdir });
    return ok(body.deleted ?? 0);
  } catch (e) {
    return { ok: false, error: toIpcError(e) };
  }
}

/** Enumerate a directory in the sidecar namespace
 *  (`GET /v1/fs/list?path=&root=`). Omit `path` to browse the enumeration root.
 *  `root` is the project being browsed: the sidecar confines the listing to that
 *  subtree (omit → falls back to the sidecar's `default_workdir`). The Rust
 *  bridge maps the sidecar's 404/400/403 to `not_found`/`validation` so callers
 *  can show a message instead of retrying. */
export async function fsList(path?: string, root?: string): Promise<Result<FsListing>> {
  if (!isTauri()) return notInTauri();
  try {
    const body = await invoke<FsListing>('agent_fs_list', { path: path ?? null, root: root ?? null });
    return ok({ path: body.path, entries: body.entries ?? [] });
  } catch (e) {
    return { ok: false, error: toIpcError(e) };
  }
}

/** Fetch a session's full transcript for UI rehydration
 *  (`GET /v1/sessions/{id}/history`). Shape is sidecar-defined; the store parses. */
export async function agentSessionHistory(sessionId: string): Promise<Result<unknown>> {
  if (!isTauri()) return notInTauri();
  try {
    const body = await invoke<unknown>('agent_session_history', { sessionId });
    return ok(body);
  } catch (e) {
    return { ok: false, error: toIpcError(e) };
  }
}

/** Rename a session (`PATCH /v1/sessions/{id}`). Returns the updated metadata. */
export async function renameAgentSession(
  sessionId: string,
  title: string,
): Promise<Result<AgentSessionMeta>> {
  if (!isTauri()) return notInTauri();
  try {
    const meta = await invoke<AgentSessionMeta>('agent_rename_session', { sessionId, title });
    return ok(meta);
  } catch (e) {
    return { ok: false, error: toIpcError(e) };
  }
}

/** Delete a session and its transcript (`DELETE /v1/sessions/{id}`), then drop
 *  any local subscription/state for it. */
export async function deleteAgentSession(sessionId: string): Promise<Result<void>> {
  if (!isTauri()) return notInTauri();
  try {
    await invoke('agent_delete_session', { sessionId });
    await detachAgentSession(sessionId);
    return ok(undefined);
  } catch (e) {
    return { ok: false, error: toIpcError(e) };
  }
}
