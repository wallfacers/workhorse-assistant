/**
 * App-level multi-session store (add-project-sessions §3).
 *
 * Owns: the open projects, the per-project session list, the active session, and
 * a per-session live conversation buffer (`runtimes`). It keeps SSE listeners
 * mounted for **every live session** — not just the visible one — so a session
 * keeps streaming in the background while another is shown (D2).
 *
 * Session lifecycle uses the multi-session bridge in `ipc/agent.ts`:
 *   - bootstrap session comes from `useAgentConnection` (adopted as the first
 *     live session);
 *   - "new session" creates another via `attachAgentSession(workdir)`;
 *   - switching to a persisted (listed) session uses `openAgentSession(id)` +
 *     history rehydration.
 *
 * The persistence-backed parts (list / history / rename / delete) degrade
 * gracefully when the sidecar lacks those endpoints: the live-session path
 * (create / switch / stream) works against today's protocol.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { UnlistenFn } from '@tauri-apps/api/event';
import {
  attachAgentSession,
  openAgentSession,
  reopenAgentSession,
  setActiveSession,
  sendAgentMessage,
  cancelAgentMessage,
  sendPermissionDecision,
  listAgentSessions,
  listAgentProjects,
  deleteAgentProject,
  agentSessionHistory,
  renameAgentSession,
  deleteAgentSession,
  type AgentConnection,
  type AgentProjectMeta,
  type AgentSessionMeta,
  type PermissionDecision,
} from '../ipc';
import { subscribeSession } from './events';
import { emptyRuntime, isPendingOnly, type ChatMessage, type ChatRuntime, type SessionScratch } from './types';
import i18n from '../i18n';

const LS_PROJECT = 'workhorse:currentProject';
const LS_RECENT = 'workhorse:recentProjects';
const RECENT_MAX = 8;

function loadRecent(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_RECENT) ?? '[]');
    return Array.isArray(raw) ? raw.filter((p): p is string => typeof p === 'string') : [];
  } catch {
    return [];
  }
}

const genId = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

/** A session attached (live) in this renderer. */
interface LiveSession {
  id: string;
  workdir: string;
  title: string;
}

/** A session shown in the switcher: live and/or persisted, with a running flag. */
export interface SessionListItem {
  id: string;
  title: string;
  running: boolean;
  live: boolean;
  /** ISO timestamp of last update (used for time-based grouping in the switcher). */
  updatedAt?: string;
}

interface SessionContextValue {
  // Projects
  projects: AgentProjectMeta[];
  recentProjects: string[];
  currentProject: string;
  openProject: (path: string) => Promise<void>;
  /** Delete a project record (hard-deletes its sessions sidecar-side; directory
   *  untouched). Drops it from recents and re-bootstraps if it was active.
   *  Returns false on failure. Gate behind the confirm dialog at the call site. */
  deleteProject: (path: string) => Promise<boolean>;
  /** Drop project + session state ahead of a runtime switch (Native↔WSL / distro
   *  change), so the bootstrap re-seeds from the new runtime's default workdir. */
  resetProjectForRuntimeSwitch: () => void;
  /** WSL distro reported by the sidecar's `/health` (null when not WSL). Lets
   *  the terminal launch a WSL shell rooted at the project (add-wsl-remote C3). */
  agentDistro: string | null;
  /** Request the project picker to open pre-navigated to `path`. Resolves with
   *  the user's picked path, or `null` if the picker was cancelled/dismissed.
   *  A second call while one is pending cancels the outstanding request. */
  requestPicker: (path: string) => Promise<string | null>;
  /** The current pending picker request, observed by ProjectSwitcher. */
  pendingPickerRequest: { path: string } | null;
  /** Resolve the pending picker request (called by ProjectSwitcher on pick/cancel). */
  resolvePicker: (picked: string | null) => void;
  // Transient SSE indicators (compaction / provider retry)
  /** Session id that most recently compacted (transient, cleared after 3s). */
  compactionSessionId: string | null;
  /** Session id currently undergoing a provider retry (cleared on output resume). */
  retrySessionId: string | null;
  // Sessions
  sessions: SessionListItem[];
  /** Raw AgentSessionMeta[] for the active project (the in-app switcher list). */
  listedSessionsMeta: AgentSessionMeta[];
  /** Fetch the full persisted session list across ALL projects (each row carries
   *  its `workdir`). Distinct from `listedSessionsMeta`; backs the cross-project
   *  session-management table. */
  fetchAllSessions: () => Promise<AgentSessionMeta[]>;
  activeSessionId: string | null;
  activeTitle: string;
  switchSession: (id: string) => Promise<void>;
  newSession: () => Promise<void>;
  renameSession: (id: string, title: string) => Promise<boolean>;
  deleteSession: (id: string) => Promise<boolean>;
  // Active conversation
  runtime: ChatRuntime;
  sendMessage: (text: string) => void;
  cancel: () => void;
  decidePermission: (requestId: string, decision: PermissionDecision) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within a SessionProvider');
  return ctx;
}

function coerceHistory(v: unknown): ChatMessage[] {
  if (v && typeof v === 'object' && Array.isArray((v as { messages?: unknown }).messages)) {
    return (v as { messages: ChatMessage[] }).messages;
  }
  return [];
}

export function SessionProvider({ agent, children }: { agent: AgentConnection; children: ReactNode }) {
  const [projects, setProjects] = useState<AgentProjectMeta[]>([]);
  const [currentProject, setCurrentProject] = useState<string>(() => {
    try {
      return localStorage.getItem(LS_PROJECT) ?? '';
    } catch {
      return '';
    }
  });
  // Locally-remembered project paths (sidecar `/v1/projects` is the eventual
  // source of truth, but until it ships this keeps the switcher useful).
  const [recentProjects, setRecentProjects] = useState<string[]>(loadRecent);
  const [liveSessions, setLiveSessions] = useState<LiveSession[]>([]);
  const [listedSessions, setListedSessions] = useState<AgentSessionMeta[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [runtimes, setRuntimes] = useState<Record<string, ChatRuntime>>({});
  // Transient SSE indicators
  const [compactionSessionId, setCompactionSessionId] = useState<string | null>(null);
  const [retrySessionId, setRetrySessionId] = useState<string | null>(null);

  // --- Pending picker request (agent confirm flow, add-open-project-tool C1) ---
  // Holds a { path, resolve } when the agent has requested the picker.
  // ProjectSwitcher observes `pendingPickerRequest` and opens the popover
  // pre-navigated to `path`. On pick: resolvePicker(picked); on dismiss:
  // resolvePicker(null). Either way the entry clears and the agent's tool call settles.
  const pickerResolveRef = useRef<((picked: string | null) => void) | null>(null);
  const [pendingPickerRequest, setPendingPickerRequest] = useState<{
    path: string;
  } | null>(null);

  const requestPicker = useCallback(
    (path: string): Promise<string | null> => {
      // D3: reject a second concurrent confirm — the agent should see a clear
      // error instead of silently superseding the user's in-progress picker.
      // The tool handler maps this throw to a `transient` ToolError.
      if (pickerResolveRef.current) {
        throw new Error('picker-already-open');
      }
      // D2: surface an assistant-visible hint in the active conversation so the
      // user's eye is drawn to the picker opening in the TitleBar corner
      // (it is easy to miss otherwise). Uses `setRuntimes` directly because
      // `setMessagesFor` is declared further down (TDZ).
      const sid = activeSessionId;
      if (sid) {
        const hint: ChatMessage = {
          id: genId('note'),
          role: 'assistant',
          parts: [{ type: 'text', content: i18n.t('project.pickerHint') }],
        };
        setRuntimes((prev) => {
          const cur = prev[sid] ?? emptyRuntime();
          return { ...prev, [sid]: { ...cur, messages: [...cur.messages, hint] } };
        });
      }
      return new Promise<string | null>((resolve) => {
        pickerResolveRef.current = resolve;
        setPendingPickerRequest({ path });
      });
    },
    [activeSessionId],
  );

  /** Resolve the current picker request with a picked path (or null for cancel). */
  const resolvePicker = useCallback((picked: string | null) => {
    const resolve = pickerResolveRef.current;
    if (!resolve) return;
    pickerResolveRef.current = null;
    setPendingPickerRequest(null);
    resolve(picked);
  }, []);

  // Teardown on unmount: settle any outstanding request so the agent never hangs.
  useEffect(() => {
    const ref = pickerResolveRef;
    return () => {
      if (ref.current) {
        ref.current(null);
        ref.current = null;
      }
    };
  }, []);

  const scratchRef = useRef<Map<string, SessionScratch>>(new Map());
  // Each entry carries the generation it was created under (B1). A monotonic
  // per-id counter (`subGenRef`) lets an in-flight `subscribeSession` detect
  // that its slot was torn down (or re-created) while it was awaiting, so a
  // superseded subscription unlistens itself instead of leaking.
  const subsRef = useRef<Map<string, { gen: number; uns: UnlistenFn[] }>>(new Map());
  const subGenRef = useRef<Map<string, number>>(new Map());
  // Pending auto-dismiss timers for transient SSE indicators (compaction 3s,
  // retry 30s). Tracked per session so they can be cleared on teardown.
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>[]>>(new Map());
  // Guards the bootstrap session creation (below): the project a bootstrap was
  // last attempted for, so we create at most one per project and never loop on a
  // failing attach. Reset when the connection drops so recovery re-bootstraps.
  const bootstrapForRef = useRef<string | null>(null);
  // Tracks which project's session list has been loaded (so bootstrap can
  // distinguish "not loaded yet" from "loaded and empty").
  const sessionsLoadedForRef = useRef<string | null>(null);
  // Latest live-session list / active id mirrored into refs, so async flows
  // (notably a batch delete that loops `await deleteSession(id)`) read the
  // up-to-date state instead of a stale render-closure snapshot — otherwise a
  // non-functional setState would resurrect already-deleted sessions.
  const liveSessionsRef = useRef<LiveSession[]>([]);
  const activeSessionIdRef = useRef<string | null>(null);
  useEffect(() => { liveSessionsRef.current = liveSessions; }, [liveSessions]);
  useEffect(() => { activeSessionIdRef.current = activeSessionId; }, [activeSessionId]);

  const scratchFor = useCallback((id: string): SessionScratch => {
    let s = scratchRef.current.get(id);
    if (!s) {
      s = { assistantId: '', delta: '' };
      scratchRef.current.set(id, s);
    }
    return s;
  }, []);

  const setMessagesFor = useCallback(
    (id: string) => (updater: (prev: ChatMessage[]) => ChatMessage[]) =>
      setRuntimes((prev) => {
        const cur = prev[id] ?? emptyRuntime();
        return { ...prev, [id]: { ...cur, messages: updater(cur.messages) } };
      }),
    [],
  );

  const setStreamingFor = useCallback(
    (id: string) => (updater: (prev: Set<string>) => Set<string>) =>
      setRuntimes((prev) => {
        const cur = prev[id] ?? emptyRuntime();
        return { ...prev, [id]: { ...cur, streaming: updater(cur.streaming) } };
      }),
    [],
  );

  // Live title update (sidecar derived it from the first user message). The
  // merged `sessions` list prefers the live title, so updating liveSessions is
  // enough to re-render the sidebar.
  const setTitleFor = useCallback(
    (id: string) => (title: string) =>
      setLiveSessions((prev) => prev.map((s) => (s.id === id ? { ...s, title } : s))),
    [],
  );

  // --- Keep SSE listeners mounted for every live session (D2/§3.3) -----------
  useEffect(() => {
    const want = new Set(liveSessions.map((s) => s.id));
    for (const id of want) {
      if (!subsRef.current.has(id)) {
        // Stamp this subscription with a fresh generation; reserve the slot so a
        // re-entrant effect run does not start a second subscribe (B1).
        const gen = (subGenRef.current.get(id) ?? 0) + 1;
        subGenRef.current.set(id, gen);
        subsRef.current.set(id, { gen, uns: [] });
        void subscribeSession(id, {
          setMessages: setMessagesFor(id),
          setStreaming: setStreamingFor(id),
          scratch: scratchFor(id),
          setTitle: setTitleFor(id),
          // Stream gave up → re-open the SAME session (re-spawn the Rust reader),
          // never mint a new one. This replaces the old hook-level reconnect that
          // attached a fresh session on every failure (the "stuck connecting"
          // loop).
          onConnectionFailed: () => { void reopenAgentSession(id); },
          // Transient SSE indicators: compaction → 3s auto-dismiss; retry →
          // cleared on output resume or 30s timeout. The chat header only
          // displays these when the session id matches the active session.
          onCompaction: () => {
            setCompactionSessionId(id);
            const tid = setTimeout(() => setCompactionSessionId((cur) => (cur === id ? null : cur)), 3000);
            const arr = timersRef.current.get(id) ?? [];
            arr.push(tid);
            timersRef.current.set(id, arr);
          },
          onProviderRetry: () => {
            setRetrySessionId(id);
            const tid = setTimeout(() => setRetrySessionId((cur) => (cur === id ? null : cur)), 30000);
            const arr = timersRef.current.get(id) ?? [];
            arr.push(tid);
            timersRef.current.set(id, arr);
          },
          onOutputResumed: () => {
            setRetrySessionId((cur) => (cur === id ? null : cur));
          },
        }).then((uns) => {
          const cur = subsRef.current.get(id);
          // Accept only if the slot is still ours; otherwise it was torn down or
          // superseded while we awaited — unlisten to avoid a leak/duplicate.
          if (cur && cur.gen === gen) subsRef.current.set(id, { gen, uns });
          else uns.forEach((u) => u());
        });
      }
    }
    for (const [id, entry] of subsRef.current) {
      if (!want.has(id)) {
        entry.uns.forEach((u) => u());
        // Clear pending auto-dismiss timers for this session.
        timersRef.current.get(id)?.forEach((t) => clearTimeout(t));
        timersRef.current.delete(id);
        subsRef.current.delete(id);
        // Bump the generation so any in-flight subscribe for this id is rejected
        // when it resolves (it would otherwise re-populate a dead slot).
        subGenRef.current.set(id, (subGenRef.current.get(id) ?? 0) + 1);
      }
    }
  }, [liveSessions, setMessagesFor, setStreamingFor, scratchFor, setTitleFor]);

  // Unsubscribe everything on unmount.
  useEffect(() => {
    const subs = subsRef.current;
    return () => {
      for (const entry of subs.values()) entry.uns.forEach((u) => u());
      subs.clear();
    };
  }, []);

  // --- Project session list (graceful when the endpoint is absent) -----------
  const refreshSessions = useCallback(async (project: string) => {
    const res = await listAgentSessions(project);
    setListedSessions(res.ok ? res.value : []);
    sessionsLoadedForRef.current = project;
  }, []);

  useEffect(() => {
    void refreshSessions(currentProject);
  }, [currentProject, refreshSessions]);

  // Re-pull the sidecar's known-projects list (after mount and after a delete).
  const refreshProjects = useCallback(async () => {
    const res = await listAgentProjects();
    if (res.ok) setProjects(res.value);
  }, []);

  useEffect(() => {
    void refreshProjects();
  }, [refreshProjects]);

  const openProject = useCallback(
    async (path: string) => {
      if (path === currentProject) return;
      setCurrentProject(path);
      try {
        localStorage.setItem(LS_PROJECT, path);
      } catch {
        // localStorage unavailable — selection stays in-memory.
      }
      // Remember the path locally (most-recent-first, deduped, capped).
      setRecentProjects((prev) => {
        const next = [path, ...prev.filter((p) => p !== path)].slice(0, RECENT_MAX);
        try {
          localStorage.setItem(LS_RECENT, JSON.stringify(next));
        } catch {
          // best-effort; in-memory list still updates
        }
        return next;
      });
      // B4: drop the previous project's live sessions so the switcher does not
      // mix sessions across projects. This tears down their SSE subscriptions
      // (via the subscribe effect) and resets to an empty-state until the user
      // opens or creates a session in the new project. The bridge-side handles
      // are intentionally left attached (cleanup is B3/§3.6, deferred).
      setActiveSessionId(null);
      setActiveSession(null);
      setLiveSessions([]);
      setRuntimes({});
      await refreshSessions(path);
    },
    [currentProject, refreshSessions],
  );

  /** Drop all project + session state for a runtime switch. A Native↔WSL switch
   *  (or a distro change) changes the filesystem namespace, so the remembered
   *  project path is no longer valid. Clearing it lets the bootstrap re-seed from
   *  the new runtime's `/health` default_workdir once the reconnect lands,
   *  instead of stranding the user on a cross-namespace path. */
  const resetProjectForRuntimeSwitch = useCallback(() => {
    setCurrentProject('');
    try {
      localStorage.removeItem(LS_PROJECT);
    } catch {
      // localStorage unavailable — in-memory reset still applies.
    }
    setActiveSessionId(null);
    setActiveSession(null);
    setLiveSessions([]);
    setRuntimes({});
    setListedSessions([]);
    sessionsLoadedForRef.current = null;
    bootstrapForRef.current = null;
  }, []);

  /** Delete a project record: hard-delete all its sessions in the sidecar (the
   *  on-disk directory is untouched), drop it from local recents, and — if it was
   *  the active project — clear it so the bootstrap re-seeds from the sidecar
   *  default (or the picker / empty state). Returns false if the sidecar rejected
   *  the delete. Gated behind the global confirm dialog at the UI layer. */
  const deleteProject = useCallback(
    async (path: string): Promise<boolean> => {
      const res = await deleteAgentProject(path);
      if (!res.ok) return false;
      // Drop from local recents (and persist).
      setRecentProjects((prev) => {
        const next = prev.filter((p) => p !== path);
        try {
          localStorage.setItem(LS_RECENT, JSON.stringify(next));
        } catch {
          // best-effort; in-memory list still updates
        }
        return next;
      });
      // If it was the active project, clear it and let the bootstrap re-seed.
      if (path === currentProject) {
        setCurrentProject('');
        try {
          localStorage.removeItem(LS_PROJECT);
        } catch {
          // localStorage unavailable — in-memory reset still applies.
        }
        setActiveSessionId(null);
        setActiveSession(null);
        setLiveSessions([]);
        setRuntimes({});
        setListedSessions([]);
        sessionsLoadedForRef.current = null;
        bootstrapForRef.current = null;
      }
      await refreshProjects();
      return true;
    },
    [currentProject, refreshProjects],
  );

  // --- Session actions -------------------------------------------------------
  const switchSession = useCallback(
    async (id: string) => {
      if (liveSessions.some((s) => s.id === id)) {
        setActiveSession(id);
        setActiveSessionId(id);
        return;
      }
      const res = await openAgentSession(id);
      if (!res.ok) return;
      const meta = listedSessions.find((s) => s.id === id);
      setLiveSessions((prev) => [...prev, { id, workdir: meta?.workdir ?? currentProject, title: meta?.title ?? '' }]);
      setActiveSessionId(id);
      const hist = await agentSessionHistory(id);
      setRuntimes((prev) => ({
        ...prev,
        [id]: { messages: hist.ok ? coerceHistory(hist.value) : [], streaming: new Set() },
      }));
      // Sync the persisted session list so the management table stays up to date.
      void refreshSessions(currentProject);
    },
    [liveSessions, listedSessions, currentProject, refreshSessions],
  );

  const newSession = useCallback(
    async (workdir?: string) => {
      // B1: attach requires an explicit project — the Rust host-cwd fallback is
      // gone. Without a project there is nothing to root a session at, so no-op
      // (the UI should route the user to the project picker instead).
      const target = (workdir ?? currentProject).trim();
      if (!target) return;
      const res = await attachAgentSession(target);
      if (!res.ok) return;
      const id = res.value;
      setLiveSessions((prev) => (prev.some((s) => s.id === id) ? prev : [...prev, { id, workdir: target, title: '' }]));
      setRuntimes((prev) => (prev[id] ? prev : { ...prev, [id]: emptyRuntime() }));
      setActiveSessionId(id);
      // Sync the persisted session list so the management table stays up to date.
      void refreshSessions(target);
    },
    [currentProject, refreshSessions],
  );

  // --- Bootstrap: ensure a live session once the sidecar is reachable --------
  // When the agent connects and the active project has no live session:
  //   1. Wait for the session list to load (refreshSessions completes).
  //   2. If the project already has persisted sessions, open the most recently
  //      updated one (reuse) instead of creating a new blank session.
  //   3. Only create a new session when the project truly has none.
  //
  // The guard resets when the connection drops, so a recovered connection
  // re-bootstraps. `listedSessions` in deps ensures we re-evaluate once the
  // list arrives (the initial [] means "not loaded yet").
  useEffect(() => {
    if (agent.status !== 'connected') {
      bootstrapForRef.current = null;
      sessionsLoadedForRef.current = null;
      return;
    }
    if (liveSessions.length > 0) return;
    if (!currentProject) {
      if (agent.defaultWorkdir) void openProject(agent.defaultWorkdir);
      return;
    }
    // Don't act until refreshSessions has loaded the list for this project.
    if (sessionsLoadedForRef.current !== currentProject) return;
    if (bootstrapForRef.current === currentProject) return;
    bootstrapForRef.current = currentProject;

    // listedSessions is sorted newest-updated first by the sidecar.
    if (listedSessions.length > 0) {
      void switchSession(listedSessions[0].id);
    } else {
      // Any local directory is a valid project: an empty project just starts a
      // fresh session (no "wrong directory" nag — the user picks projects from
      // the TitleBar switcher). decouple-project-from-launch-cwd.
      void newSession(currentProject);
    }
  }, [agent.status, agent.defaultWorkdir, currentProject, liveSessions.length, listedSessions, newSession, openProject, switchSession]);

  // Cross-project session list for the management table: an empty workdir asks
  // the sidecar for every project's persisted sessions (decouple-project-from-launch-cwd).
  const fetchAllSessions = useCallback(async (): Promise<AgentSessionMeta[]> => {
    const res = await listAgentSessions();
    return res.ok ? res.value : [];
  }, []);

  const renameSession = useCallback(async (id: string, title: string): Promise<boolean> => {
    const res = await renameAgentSession(id, title);
    if (!res.ok) return false;
    setLiveSessions((prev) => prev.map((s) => (s.id === id ? { ...s, title } : s)));
    setListedSessions((prev) => prev.map((s) => (s.id === id ? { ...s, title } : s)));
    return true;
  }, []);

  const deleteSession = useCallback(
    async (id: string): Promise<boolean> => {
      const res = await deleteAgentSession(id);
      if (!res.ok) return false;
      // Drop the local subscription (deleteAgentSession already detached the bridge).
      const entry = subsRef.current.get(id);
      if (entry) {
        entry.uns.forEach((u) => u());
        subsRef.current.delete(id);
      }
      scratchRef.current.delete(id);

      // B2: compute the next active session up front, then commit each piece of
      // state — no bridge call (setActiveSession) nested inside a setState
      // updater, which React may double-invoke under StrictMode.
      //
      // Read the *current* live list and active id from refs (not the render
      // closure), so a batch delete looping `await deleteSession(id)` sees each
      // prior removal; updating the refs synchronously keeps the next iteration
      // correct without waiting for a re-render.
      const remaining = liveSessionsRef.current.filter((s) => s.id !== id);
      liveSessionsRef.current = remaining;
      setListedSessions((prev) => prev.filter((s) => s.id !== id));
      setRuntimes((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setLiveSessions(remaining);
      if (activeSessionIdRef.current === id) {
        const nextActive = remaining[remaining.length - 1]?.id ?? null;
        activeSessionIdRef.current = nextActive;
        setActiveSession(nextActive);
        setActiveSessionId(nextActive);
      }
      return true;
    },
    [],
  );

  // --- Active conversation actions (ported from AgentRail) -------------------
  const sendMessage = useCallback(
    (text: string) => {
      const id = activeSessionId;
      if (!id) return;
      const aid = genId('a');
      const scr = scratchFor(id);
      scr.assistantId = aid;
      scr.delta = '';
      setStreamingFor(id)((prev) => new Set(prev).add(aid));
      setMessagesFor(id)((prev) => [
        ...prev,
        { id: genId('u'), role: 'user', parts: [{ type: 'text', content: text }] },
        { id: aid, role: 'assistant', parts: [{ type: 'pending' }] },
      ]);
      void sendAgentMessage(text, id);
    },
    [activeSessionId, scratchFor, setStreamingFor, setMessagesFor],
  );

  const cancel = useCallback(() => {
    const id = activeSessionId;
    if (!id) return;
    void cancelAgentMessage(id);
    const scr = scratchFor(id);
    scr.assistantId = '';
    scr.delta = '';
    setStreamingFor(id)(() => new Set());
    setMessagesFor(id)((prev) =>
      prev
        .filter((m) => !isPendingOnly(m))
        .map((m) =>
          m.role === 'assistant'
            ? { ...m, parts: m.parts.map((p) => (p.type === 'reasoning' && p.status === 'streaming' ? { ...p, status: 'done' as const, endedAt: Date.now() } : p)) }
            : m,
        ),
    );
  }, [activeSessionId, scratchFor, setStreamingFor, setMessagesFor]);

  const decidePermission = useCallback(
    (requestId: string, decision: PermissionDecision) => {
      // C3: target the session whose runtime actually holds this request, not
      // merely whichever session is active when the button is clicked.
      let owner: string | null = null;
      for (const [sid, rt] of Object.entries(runtimes)) {
        if (rt.messages.some((m) => m.parts.some((p) => p.type === 'permission' && p.requestId === requestId))) {
          owner = sid;
          break;
        }
      }
      const id = owner ?? activeSessionId;
      if (!id) return;
      void sendPermissionDecision(requestId, decision, id);
      const resolved = decision.startsWith('allow') ? ('allowed' as const) : ('denied' as const);
      setMessagesFor(id)((prev) =>
        prev.map((m) => ({
          ...m,
          parts: m.parts.map((p) => (p.type === 'permission' && p.requestId === requestId ? { ...p, status: resolved } : p)),
        })),
      );
    },
    [activeSessionId, runtimes, setMessagesFor],
  );

  // --- Derived view data -----------------------------------------------------
  const runtime = (activeSessionId && runtimes[activeSessionId]) || emptyRuntime();

  const sessions = useMemo<SessionListItem[]>(() => {
    const byId = new Map<string, SessionListItem>();
    for (const s of listedSessions) {
      byId.set(s.id, { id: s.id, title: s.title, running: s.status === 'running', live: false, updatedAt: s.updatedAt });
    }
    for (const s of liveSessions) {
      const running = (runtimes[s.id]?.streaming.size ?? 0) > 0;
      const prev = byId.get(s.id);
      byId.set(s.id, { id: s.id, title: s.title || prev?.title || '', running: running || (prev?.running ?? false), live: true, updatedAt: prev?.updatedAt });
    }
    return [...byId.values()];
  }, [listedSessions, liveSessions, runtimes]);

  const activeTitle = useMemo(
    () => sessions.find((s) => s.id === activeSessionId)?.title ?? '',
    [sessions, activeSessionId],
  );

  const value: SessionContextValue = {
    projects,
    recentProjects,
    currentProject,
    openProject,
    deleteProject,
    resetProjectForRuntimeSwitch,
    agentDistro: agent.distro,
    requestPicker,
    pendingPickerRequest,
    resolvePicker,
    sessions,
    listedSessionsMeta: listedSessions,
    fetchAllSessions,
    activeSessionId,
    activeTitle,
    compactionSessionId,
    retrySessionId,
    switchSession,
    newSession,
    renameSession,
    deleteSession,
    runtime,
    sendMessage,
    cancel,
    decidePermission,
  };

  return <SessionContext value={value}>{children}</SessionContext>;
}
