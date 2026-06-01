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

/** Normalize a project path for comparison: trim trailing separators, collapse
 *  repeated separators, and lowercase (Windows paths are case-insensitive). */
function normalizePath(p: string): string {
  return p.replace(/[\\/]+$/, '').replace(/[\\/]+/g, '/').toLowerCase();
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
  /** WSL distro reported by the sidecar's `/health` (null when not WSL). Lets
   *  the terminal launch a WSL shell rooted at the project (add-wsl-remote C3). */
  agentDistro: string | null;
  /** True when the current project has no sessions AND the agent's default workdir
   *  differs from the current project — the user is likely in the wrong project. */
  projectMismatch: boolean;
  /** The sidecar's reported default workdir (agent process CWD). */
  agentDefaultWorkdir: string | null;
  // Sessions
  sessions: SessionListItem[];
  /** Raw AgentSessionMeta[] for the session management table (timestamps, message counts). */
  listedSessionsMeta: AgentSessionMeta[];
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

  const scratchRef = useRef<Map<string, SessionScratch>>(new Map());
  // Each entry carries the generation it was created under (B1). A monotonic
  // per-id counter (`subGenRef`) lets an in-flight `subscribeSession` detect
  // that its slot was torn down (or re-created) while it was awaiting, so a
  // superseded subscription unlistens itself instead of leaking.
  const subsRef = useRef<Map<string, { gen: number; uns: UnlistenFn[] }>>(new Map());
  const subGenRef = useRef<Map<string, number>>(new Map());
  // Guards the bootstrap session creation (below): the project a bootstrap was
  // last attempted for, so we create at most one per project and never loop on a
  // failing attach. Reset when the connection drops so recovery re-bootstraps.
  const bootstrapForRef = useRef<string | null>(null);
  // Tracks which project's session list has been loaded (so bootstrap can
  // distinguish "not loaded yet" from "loaded and empty").
  const sessionsLoadedForRef = useRef<string | null>(null);

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

  useEffect(() => {
    void (async () => {
      const res = await listAgentProjects();
      if (res.ok) setProjects(res.value);
    })();
  }, []);

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

  /** True when the user is likely looking at the wrong project: the current
   *  project has zero sessions, the sidecar reports a different default workdir,
   *  and the session list has finished loading (so we aren't mid-flight). */
  const projectMismatch = useMemo(() => {
    if (agent.status !== 'connected') return false;
    if (!currentProject) return false;
    if (sessionsLoadedForRef.current !== currentProject) return false;
    if (listedSessions.length > 0) return false;
    if (!agent.defaultWorkdir) return false;
    return normalizePath(agent.defaultWorkdir) !== normalizePath(currentProject);
  }, [agent.status, currentProject, listedSessions, agent.defaultWorkdir]);

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
    },
    [liveSessions, listedSessions, currentProject],
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
    },
    [currentProject],
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
    } else if (projectMismatch) {
      // Don't create a new session under the wrong project — the UI will
      // show a hint prompting the user to switch to agent.defaultWorkdir.
    } else {
      void newSession(currentProject);
    }
  }, [agent.status, agent.defaultWorkdir, currentProject, liveSessions.length, listedSessions, newSession, openProject, switchSession, projectMismatch]);

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
      const remaining = liveSessions.filter((s) => s.id !== id);
      setListedSessions((prev) => prev.filter((s) => s.id !== id));
      setRuntimes((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setLiveSessions(remaining);
      if (activeSessionId === id) {
        const nextActive = remaining[remaining.length - 1]?.id ?? null;
        setActiveSession(nextActive);
        setActiveSessionId(nextActive);
      }
      return true;
    },
    [liveSessions, activeSessionId],
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
    agentDistro: agent.distro,
    projectMismatch,
    agentDefaultWorkdir: agent.defaultWorkdir ?? null,
    sessions,
    listedSessionsMeta: listedSessions,
    activeSessionId,
    activeTitle,
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
