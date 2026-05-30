import { useEffect, useRef, useState, useCallback } from 'react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { AlertTriangle, ArrowDown, ArrowUp, Copy, LayoutList, Plus, Settings, ThumbsDown, ThumbsUp } from 'lucide-react';
import { MOCK_TASKS } from './agent-rail.mock';
import type { MockTask } from './agent-rail.mock';
import TaskListModal from './TaskListModal';
import SettingsModal from './SettingsModal';
import type { AgentConnection } from '../ipc';
import { sendAgentMessage, activeSessionId } from '../ipc';
import { useAutoScroll } from '../hooks/use-auto-scroll';
import MarkdownContent from './chat/MarkdownContent';
import ToolCallBlock from './chat/ToolCallBlock';
import ReasoningPart from './chat/ReasoningPart';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MessagePart =
  | { type: 'text'; content: string }
  | { type: 'reasoning'; text: string; status: 'streaming' | 'done'; redacted?: boolean; startedAt?: number; endedAt?: number }
  | { type: 'tool_call'; id: string; name: string; input: unknown; status: 'running' | 'done' | 'error'; output?: unknown }
  | { type: 'error'; code: string; message: string };

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  parts: MessagePart[];
}

// ---------------------------------------------------------------------------
// StreamingText — character-by-character reveal (data-talk PacedMarkdown spirit)
// ---------------------------------------------------------------------------

const PACE_MS = 24;

function StreamingText({ target, streaming }: { target: string; streaming: boolean }) {
  const [shown, setShown] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const targetRef = useRef(target);
  targetRef.current = target;

  useEffect(() => {
    if (!streaming) {
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      setShown(target);
      return;
    }

    // Bypass pacing for code fences — reveal fenced code instantly to avoid
    // per-tick re-tokenize flicker (data-talk PacedMarkdown parity).
    if (/```|~~~/.test(target)) {
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      setShown(target);
      return;
    }

    const tick = () => {
      const t = targetRef.current;
      setShown((prev) => {
        const remaining = t.length - prev.length;
        if (remaining <= 0) return prev;
        let step: number;
        if (remaining <= 12) step = 2;
        else if (remaining <= 48) step = 4;
        else if (remaining <= 96) step = 8;
        else step = Math.max(24, Math.floor(remaining / 8));
        return t.slice(0, Math.min(prev.length + step, t.length));
      });
      timerRef.current = setTimeout(tick, PACE_MS);
    };

    if (!timerRef.current) tick();
    return () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } };
  }, [target, streaming]);

  // Render markdown even during streaming — StreamingText feeds the text in
  // progressively, MarkdownContent handles it.
  return <MarkdownContent content={shown} streaming={streaming} />;
}

// ---------------------------------------------------------------------------
// Connection status helpers
// ---------------------------------------------------------------------------

const AGENT_STATUS_DOT: Record<AgentConnection['status'], string> = {
  idle: 'bg-gray-400',
  connecting: 'bg-amber-400 animate-pulse',
  connected: 'bg-green-500',
  error: 'bg-red-500',
};

const AGENT_STATUS_TITLE: Record<AgentConnection['status'], (a: AgentConnection) => string> = {
  idle: () => '未连接',
  connecting: () => '连接中…',
  connected: (a) => `已连接（session ${a.sessionId}）`,
  error: (a) => `连接失败：${a.error ?? ''}`,
};

// ---------------------------------------------------------------------------
// AgentRail
// ---------------------------------------------------------------------------

export default function AgentRail({
  isDarkMode,
  setIsDarkMode,
  agent,
  autoExpandReasoning,
  setAutoExpandReasoning,
}: {
  isDarkMode: boolean;
  setIsDarkMode: (dark: boolean) => void;
  agent: AgentConnection;
  autoExpandReasoning: boolean;
  setAutoExpandReasoning: (v: boolean) => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingIds, setStreamingIds] = useState<Set<string>>(new Set());

  // A reactive counter (not a ref): bumping it on send re-renders, which lets
  // `resetDeps` actually change so the forced re-follow useLayoutEffect fires.
  const [userSendVersion, setUserSendVersion] = useState(0);
  const { ref: scrollRef, isAtBottom, scrollToBottom } = useAutoScroll(
    [messages.length],
    [userSendVersion],
  );

  const [, setActiveTask] = useState<MockTask>(
    MOCK_TASKS.find((t) => t.active) ?? MOCK_TASKS[0]
  );
  const handleSelectTask = (task: MockTask) => setActiveTask(task);

  // Ref-based delta buffer for streaming
  const assistantIdRef = useRef('');
  const deltaRef = useRef('');

  // Subscribe to assistant SSE events
  useEffect(() => {
    const sid = activeSessionId();
    if (!sid) return;
    const unlistens: UnlistenFn[] = [];

    (async () => {
      // --- text delta ---
      unlistens.push(await listen<{ delta: string }>(`agent://text/${sid}`, (e) => {
        if (!assistantIdRef.current) {
          assistantIdRef.current = `a-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          deltaRef.current = '';
          setStreamingIds((prev) => new Set(prev).add(assistantIdRef.current));
        }
        deltaRef.current += e.payload.delta;
        const id = assistantIdRef.current;
        const content = deltaRef.current;
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant' && last.id === id) {
            return [...prev.slice(0, -1), { ...last, parts: [{ type: 'text', content }] }];
          }
          return [...prev, { id, role: 'assistant', parts: [{ type: 'text', content }] }];
        });
      }));

      // --- text done ---
      unlistens.push(await listen<{ stopReason: string }>(`agent://textdone/${sid}`, () => {
        const id = assistantIdRef.current;
        if (id) setStreamingIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
        assistantIdRef.current = '';
        deltaRef.current = '';
      }));

      // --- tool call start ---
      // Rust relays these payloads with `#[serde(rename_all = "camelCase")]`,
      // so the field is `toolCallId`, not `tool_call_id`.
      unlistens.push(await listen<{ toolCallId: string; name: string; input: unknown }>(`agent://toolstart/${sid}`, (e) => {
        const tcId = e.payload.toolCallId;
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant') {
            const parts = [...last.parts, { type: 'tool_call' as const, id: tcId, name: e.payload.name, input: e.payload.input, status: 'running' as const }];
            return [...prev.slice(0, -1), { ...last, parts }];
          }
          // No assistant message yet — create one with the tool call
          return [...prev, { id: `a-${Date.now()}`, role: 'assistant', parts: [{ type: 'tool_call', id: tcId, name: e.payload.name, input: e.payload.input, status: 'running' as const }] }];
        });
      }));

      // --- tool call done ---
      // The sidecar's `tool_call_done` event carries only the id (no output/error
      // in the V1 protocol); we mark the block done and surface output if a
      // future protocol revision adds the (camelCase) field.
      unlistens.push(await listen<{ toolCallId: string; output?: unknown; error?: string }>(`agent://tooldone/${sid}`, (e) => {
        const tcId = e.payload.toolCallId;
        setMessages((prev) => prev.map((msg) => {
          if (msg.role !== 'assistant') return msg;
          return {
            ...msg,
            parts: msg.parts.map((p) => {
              if (p.type === 'tool_call' && p.id === tcId) {
                return { ...p, status: e.payload.error ? 'error' as const : 'done' as const, output: e.payload.output ?? e.payload.error };
              }
              return p;
            }),
          };
        }));
      }));

      // --- reasoning start (a thinking block began) ---
      // Reasoning arrives before the assistant's text, so this may be the first
      // event of an assistant turn: ensure an assistant message exists (mirroring
      // the text-delta path) and append a fresh streaming reasoning part.
      // Rust relays camelCase: `reasoningType` is "thinking" | "redacted".
      unlistens.push(await listen<{ reasoningType: string }>(`agent://reasoning_start/${sid}`, (e) => {
        if (!assistantIdRef.current) {
          assistantIdRef.current = `a-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          deltaRef.current = '';
          setStreamingIds((prev) => new Set(prev).add(assistantIdRef.current));
        }
        const id = assistantIdRef.current;
        const redacted = e.payload.reasoningType === 'redacted';
        const part: MessagePart = { type: 'reasoning', text: '', status: 'streaming', redacted, startedAt: Date.now() };
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant' && last.id === id) {
            return [...prev.slice(0, -1), { ...last, parts: [...last.parts, part] }];
          }
          return [...prev, { id, role: 'assistant', parts: [part] }];
        });
      }));

      // --- reasoning delta (thinking-text increment, regular thinking only) ---
      unlistens.push(await listen<{ delta: string }>(`agent://reasoning_delta/${sid}`, (e) => {
        const id = assistantIdRef.current;
        if (!id) return;
        setMessages((prev) => prev.map((msg) => {
          if (msg.role !== 'assistant' || msg.id !== id) return msg;
          const parts = [...msg.parts];
          for (let i = parts.length - 1; i >= 0; i--) {
            const p = parts[i];
            if (p.type === 'reasoning' && p.status === 'streaming') {
              parts[i] = { ...p, text: p.text + e.payload.delta };
              break;
            }
          }
          return { ...msg, parts };
        }));
      }));

      // --- reasoning end (thinking block finished) ---
      unlistens.push(await listen<Record<string, never>>(`agent://reasoning_end/${sid}`, () => {
        const id = assistantIdRef.current;
        if (!id) return;
        setMessages((prev) => prev.map((msg) => {
          if (msg.role !== 'assistant' || msg.id !== id) return msg;
          const parts = [...msg.parts];
          for (let i = parts.length - 1; i >= 0; i--) {
            const p = parts[i];
            if (p.type === 'reasoning' && p.status === 'streaming') {
              parts[i] = { ...p, status: 'done', endedAt: Date.now() };
              break;
            }
          }
          return { ...msg, parts };
        }));
      }));

      // --- error from sidecar (model not found, provider error, etc.) ---
      unlistens.push(await listen<{ code: string; message: string; recoverable: boolean }>(`agent://error/${sid}`, (e) => {
        assistantIdRef.current = '';
        deltaRef.current = '';
        setStreamingIds(new Set());
        const { code, message } = e.payload;
        setMessages((prev) => [...prev, {
          id: `e-${Date.now()}`,
          role: 'assistant',
          parts: [{ type: 'error', code, message }],
        }]);
      }));
    })();

    return () => { unlistens.forEach((u) => u()); };
  }, [agent.status, agent.sessionId]);

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text || agent.status !== 'connected') return;
    setMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: 'user', parts: [{ type: 'text', content: text }] }]);
    setInputText('');
    setUserSendVersion((v) => v + 1);
    void sendAgentMessage(text);
  }, [inputText, agent.status]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const inputBox = (
    <div className="bg-white dark:bg-surface-dark border border-outline dark:border-neutral-800 rounded-lg px-3 pt-2.5 pb-2 flex flex-col focus-within:ring-1 focus-within:ring-gray-300 dark:focus-within:ring-neutral-700 transition-all shadow-[0_2px_8px_rgba(0,0,0,0.03)] overflow-hidden">
      <textarea
        placeholder="请输入任务，交给我来完成"
        rows={3}
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
        onKeyDown={handleKeyDown}
        className="w-full resize-none overflow-y-auto custom-scrollbar bg-transparent outline-none text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 text-[12.5px] leading-relaxed"
      />
      <div className="flex items-center justify-between mt-1">
        <button type="button" className="flex items-center gap-1 px-2.5 py-1 rounded-full border border-outline dark:border-neutral-700 bg-surface-muted dark:bg-neutral-800/80 hover:bg-gray-100 dark:hover:bg-neutral-800 text-gray-600 dark:text-gray-300 text-[11.5px] font-semibold transition-colors">
          <Plus className="w-3 h-3" />
          <span>选择文件</span>
        </button>
        <button
          type="button"
          aria-label="发送"
          disabled={!inputText.trim() || agent.status !== 'connected'}
          onClick={handleSend}
          className="p-1.5 rounded-full transition-colors disabled:bg-neutral-200/90 disabled:dark:bg-neutral-700 disabled:text-gray-400 disabled:dark:text-gray-500 disabled:cursor-not-allowed bg-gray-800 dark:bg-gray-200 hover:bg-gray-700 dark:hover:bg-gray-300 text-white dark:text-gray-800"
        >
          <ArrowUp className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );

  const hasMessages = messages.length > 0;

  return (
    <div className="w-[400px] bg-white dark:bg-surface-dark-elevated flex flex-col rounded-lg border border-outline dark:border-neutral-800/60 shadow-[0_4px_24px_rgba(0,0,0,0.02)] h-full text-[13px] flex-shrink-0 overflow-hidden">

      {hasMessages ? (
        <>
          {/* Chat area with overflow-anchor for anti-jitter */}
          <div className="relative flex-1 min-h-0">
            <div
              ref={scrollRef}
              className="h-full overflow-y-auto overflow-anchor-auto scrollbar-gutter-stable custom-scrollbar px-3 py-3 space-y-4"
            >
              {messages.map((msg) => (
                msg.role === 'user' ? (
                  <div key={msg.id} className="flex justify-end">
                    <div className="max-w-[85%] bg-pink-50 dark:bg-pink-950/40 rounded-lg px-3.5 py-2.5 text-pink-900 dark:text-pink-200 text-[12.5px] leading-relaxed shadow-sm">
                      {msg.parts.filter((p) => p.type === 'text').map((p) => (p as { content: string }).content).join('')}
                    </div>
                  </div>
                ) : (
                  <div key={msg.id} className="flex gap-2 items-start">
                    <div className="w-6 h-6 flex-shrink-0 rounded-lg bg-gradient-to-br from-orange-400 via-pink-500 to-indigo-500 text-white font-bold text-[10px] flex items-center justify-center shadow-sm">
                      W
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="min-h-[36px] bg-surface-muted dark:bg-surface-dark rounded-lg px-3.5 py-2.5 text-gray-800 dark:text-gray-200 text-[12.5px] leading-relaxed border border-outline/50 dark:border-neutral-800/60">
                        {msg.parts.map((part, i) => {
                          if (part.type === 'reasoning') {
                            return (
                              <ReasoningPart
                                key={`reasoning-${i}`}
                                text={part.text}
                                status={part.status}
                                redacted={part.redacted}
                                startedAt={part.startedAt}
                                endedAt={part.endedAt}
                                autoExpand={autoExpandReasoning}
                              />
                            );
                          }
                          if (part.type === 'text') {
                            const isStreaming = streamingIds.has(msg.id) && i === msg.parts.length - 1;
                            return (
                              <StreamingText
                                key={`text-${i}`}
                                target={part.content}
                                streaming={isStreaming}
                              />
                            );
                          }
                          if (part.type === 'tool_call') {
                            return (
                              <ToolCallBlock
                                key={`tool-${part.id}`}
                                tool={{ name: part.name, input: part.input, status: part.status, output: part.output }}
                              />
                            );
                          }
                          if (part.type === 'error') {
                            return (
                              <div
                                key={`error-${i}`}
                                className="flex items-start gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
                              >
                                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                                <div>
                                  <span className="font-medium">Error ({part.code})</span>
                                  <span className="ml-1">{part.message}</span>
                                </div>
                              </div>
                            );
                          }
                          return null;
                        })}
                      </div>
                      {!streamingIds.has(msg.id) && (
                        <div className="flex items-center gap-2 mt-1.5 ml-1 text-gray-400 dark:text-gray-500">
                          <button className="p-0.5 hover:text-gray-700 dark:hover:text-gray-200 transition-colors" title="复制"><Copy className="w-3 h-3" /></button>
                          <button className="p-0.5 hover:text-gray-700 dark:hover:text-gray-200 transition-colors" title="好用"><ThumbsUp className="w-3 h-3" /></button>
                          <button className="p-0.5 hover:text-gray-700 dark:hover:text-gray-200 transition-colors" title="不好"><ThumbsDown className="w-3 h-3" /></button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              ))}
            </div>

            {/* Scroll-to-bottom button — opacity-based, no mount/unmount jitter */}
            <button
              type="button"
              onClick={scrollToBottom}
              aria-label="滚到底部"
              className={`absolute bottom-2 right-3 p-1.5 rounded-full bg-white dark:bg-neutral-800 border border-outline/60 dark:border-neutral-700 shadow-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-neutral-700 transition-all duration-200 ${isAtBottom ? 'opacity-0 pointer-events-none' : 'opacity-100 pointer-events-auto'}`}
            >
              <ArrowDown className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Input — pinned to bottom */}
          <div className="px-3 pb-2">{inputBox}</div>
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center px-3">
          <div className="w-full max-w-[360px]">
            <div className="text-center mb-4">
              <div className="w-10 h-10 mx-auto rounded-lg bg-gradient-to-br from-orange-400 via-pink-500 to-indigo-500 text-white font-bold text-sm flex items-center justify-center shadow-sm mb-3">W</div>
              <p className="text-gray-500 dark:text-gray-400 text-[12px]">有什么可以帮你的？</p>
            </div>
            {inputBox}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="px-3 pb-3 pt-1 flex items-center justify-between border-t border-outline/50 dark:border-neutral-800/60">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-orange-400 via-pink-500 to-indigo-500 flex-shrink-0 flex items-center justify-center text-[10px] text-white font-bold shadow-sm">W</div>
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${AGENT_STATUS_DOT[agent.status]}`} title={AGENT_STATUS_TITLE[agent.status](agent)} />
          <span className="text-[12.5px] font-semibold text-gray-800 dark:text-gray-200 truncate max-w-[120px]">wallfacers</span>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setModalOpen(true)} className="p-1.5 rounded-lg hover:bg-gray-200/80 dark:hover:bg-neutral-800 text-gray-500 dark:text-gray-400 transition-colors" title="任务列表" aria-label="打开任务列表"><LayoutList className="w-4 h-4" /></button>
          <button type="button" onClick={() => setSettingsOpen(true)} className="p-1.5 rounded-lg hover:bg-gray-200/80 dark:hover:bg-neutral-800 text-gray-500 dark:text-gray-400 transition-colors" title="设置" aria-label="打开设置"><Settings className="w-4 h-4" /></button>
        </div>
      </div>

      {modalOpen && <TaskListModal onClose={() => setModalOpen(false)} onSelect={handleSelectTask} />}
      {settingsOpen && <SettingsModal isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} onClose={() => setSettingsOpen(false)} agent={agent} autoExpandReasoning={autoExpandReasoning} setAutoExpandReasoning={setAutoExpandReasoning} />}
    </div>
  );
}
