import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, LayoutList, Plus, Settings, ShieldAlert, ShieldCheck, Sparkles, Square } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { MockTask } from './agent-rail.mock';
import TaskListModal from './TaskListModal';
import SettingsModal from './SettingsModal';
import SessionHeader from './SessionHeader';
import type { AgentConnection } from '../ipc';
import type { PermissionDecision } from '../ipc';
import { useAutoScroll } from '../hooks/use-auto-scroll';
import { useApp } from '../context';
import { useSession } from '../session/SessionProvider';
import { isPendingOnly } from '../session/types';
import MarkdownContent from './chat/MarkdownContent';
import MessageActionBar from './chat/MessageActionBar';
import ToolCallBlock from './chat/ToolCallBlock';
import ReasoningPart from './chat/ReasoningPart';
import i18n from '../i18n';

// ---------------------------------------------------------------------------
// First-token placeholder: a blinking, colour-cycling star (Claude-Code-CLI
// style) until the first token arrives.
// ---------------------------------------------------------------------------
function PendingStar() {
  return (
    <span className="inline-flex items-center" aria-label={i18n.t('agent.generating')}>
      <Sparkles className="w-4 h-4 agent-pending-star" />
    </span>
  );
}

/** Tool-permission prompt card. "允许" sends allow_session; "拒绝" sends deny.
 *  Sensitive (dangerous) operations are re-prompted by the sidecar every time. */
function PermissionCard({ part, onDecide }: {
  part: { requestId: string; tool: string; resource: string; dangerous: boolean; reason: string; status: 'pending' | 'allowed' | 'denied' };
  onDecide: (requestId: string, decision: PermissionDecision) => void;
}) {
  const { t } = useTranslation();
  const { requestId, tool, resource, dangerous, reason, status } = part;
  const tone = dangerous
    ? 'border-danger/30 bg-danger/10 dark:border-danger/30 dark:bg-danger/10'
    : 'border-warning/30 bg-warning/10 dark:border-warning/30 dark:bg-warning/10';
  return (
    <div className={`my-1.5 rounded-lg border px-3 py-2 text-[12px] leading-relaxed ${tone}`}>
      <div className="flex items-center gap-1.5 font-medium text-on-surface dark:text-on-canvas-dark">
        <ShieldAlert className={`w-3.5 h-3.5 ${dangerous ? 'text-danger' : 'text-warning'}`} />
        <span>{t('agent.permissionRequest')}{tool}</span>
        {dangerous && (
          <span className="ml-1 rounded-md px-1 py-0.5 text-[10px] font-semibold bg-danger/10 text-danger dark:text-danger">{t('agent.sensitiveAction')}</span>
        )}
      </div>
      {resource && (
        <div className="mt-1 font-mono text-[11px] break-all text-on-surface-muted dark:text-on-canvas-dark-muted">{resource}</div>
      )}
      {reason && <div className="mt-0.5 text-on-surface-muted dark:text-on-canvas-dark-muted">{reason}</div>}
      {status === 'pending' ? (
        <div className="flex items-center gap-2 mt-2">
          <button
            type="button"
            onClick={() => onDecide(requestId, 'allow_session')}
            className="px-2.5 py-1 rounded-md text-[11.5px] font-semibold bg-tertiary text-on-tertiary hover:bg-primary-container transition-colors"
          >
            {t('common.allow')}
          </button>
          <button
            type="button"
            onClick={() => onDecide(requestId, 'deny')}
            className="px-2.5 py-1 rounded-md text-[11.5px] font-semibold border border-outline dark:border-outline-dark text-on-surface-muted dark:text-on-canvas-dark-muted hover:bg-surface-muted dark:hover:bg-surface-dark-muted transition-colors"
          >
            {t('common.deny')}
          </button>
        </div>
      ) : (
        <div className={`flex items-center gap-1.5 mt-1.5 text-[11.5px] ${status === 'allowed' ? 'text-success dark:text-success' : 'text-on-surface-muted dark:text-on-canvas-dark-muted'}`}>
          {status === 'allowed' ? <ShieldCheck className="w-3.5 h-3.5" /> : <ShieldAlert className="w-3.5 h-3.5" />}
          <span>{status === 'allowed' ? t('agent.allowedRemembered') : t('agent.denied')}</span>
        </div>
      )}
    </div>
  );
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
    // Bypass pacing for code fences — reveal fenced code instantly.
    if (/^(`{3,}|~{3,})/m.test(target)) {
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

  return <MarkdownContent content={shown} streaming={streaming} />;
}

// ---------------------------------------------------------------------------
// Connection status dot
// ---------------------------------------------------------------------------
const AGENT_STATUS_DOT: Record<AgentConnection['status'], string> = {
  idle: 'bg-on-surface-muted',
  connecting: 'bg-warning animate-pulse',
  connected: 'bg-success',
  error: 'bg-danger',
};

// ---------------------------------------------------------------------------
// AgentRail — now a view over the active session's store slice (§4.1)
// ---------------------------------------------------------------------------
export default function AgentRail() {
  const { t } = useTranslation();
  const { agent, autoExpandReasoning } = useApp();
  const { runtime, activeSessionId, sendMessage, cancel, decidePermission, newSession } = useSession();
  const messages = runtime.messages;
  const streamingIds = runtime.streaming;

  const [modalOpen, setModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [inputText, setInputText] = useState('');

  // A reactive counter that bumps on send so the auto-scroll re-follows.
  const [userSendVersion, setUserSendVersion] = useState(0);
  const { ref: scrollRef, isAtBottom, scrollToBottom } = useAutoScroll(
    [messages.length],
    [userSendVersion],
  );


  // Task selection is a no-op until the task list is wired to real state.
  const handleSelectTask = (_task: MockTask) => { /* no-op */ };

  const isStreaming = streamingIds.size > 0;

  const handleSend = () => {
    const text = inputText.trim();
    if (!text || agent.status !== 'connected') return;
    sendMessage(text);
    setInputText('');
    setUserSendVersion((v) => v + 1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return; // ignore Enter during IME composition (CJK)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const statusTitle = (a: AgentConnection): string => {
    switch (a.status) {
      case 'idle': return t('agent.status.disconnected');
      case 'connecting': return t('agent.status.connecting');
      case 'connected': return t('agent.status.connected');
      case 'error': return t('agent.status.failed', { error: a.error ?? '' });
    }
  };

  const inputBox = (
    <div className="bg-surface dark:bg-surface-dark border border-outline dark:border-outline-dark rounded-lg px-3 pt-2.5 pb-2 flex flex-col focus-within:ring-1 focus-within:ring-outline-strong dark:focus-within:ring-outline-dark transition-all shadow-[0_2px_8px_rgba(0,0,0,0.03)] overflow-hidden">
      <textarea
        data-testid="chat-input"
        data-agent-clickable
        placeholder={t('agent.placeholder')}
        rows={3}
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
        onKeyDown={handleKeyDown}
        className="w-full resize-none overflow-y-auto custom-scrollbar bg-transparent outline-none text-on-surface dark:text-on-canvas-dark placeholder-on-surface-muted dark:placeholder-on-canvas-dark-muted text-[12.5px] leading-relaxed"
      />
      <div className="flex items-center justify-between mt-1">
        <button type="button" data-testid="choose-file" data-agent-clickable className="flex items-center gap-1 px-2.5 py-1 rounded-full border border-outline dark:border-outline-dark bg-surface-muted dark:bg-surface-dark-muted/80 hover:bg-surface-muted dark:hover:bg-surface-dark-muted text-on-surface-muted dark:text-on-canvas-dark-muted text-[11.5px] font-semibold transition-colors">
          <Plus className="w-3 h-3" />
          <span>{t('agent.chooseFile')}</span>
        </button>
        {isStreaming ? (
          <button
            type="button"
            data-testid="stop-stream"
            data-agent-clickable
            aria-label={t('common.stop')}
            onClick={cancel}
            className="p-1.5 rounded-full transition-colors bg-tertiary text-on-tertiary hover:bg-primary-container"
          >
            <Square className="w-3 h-3 fill-current" />
          </button>
        ) : (
          <button
            type="button"
            data-testid="send-message"
            data-agent-clickable
            aria-label={t('common.send')}
            disabled={!inputText.trim() || agent.status !== 'connected'}
            onClick={handleSend}
            className="p-1.5 rounded-full transition-colors disabled:bg-canvas disabled:text-on-surface-muted dark:disabled:bg-surface-dark-muted dark:disabled:text-on-canvas-dark-muted disabled:cursor-not-allowed bg-tertiary text-on-tertiary hover:bg-primary-container"
          >
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );

  const hasMessages = messages.length > 0;

  return (
    <div className="w-full bg-surface dark:bg-surface-dark-elevated flex flex-col rounded-lg border border-outline dark:border-outline-dark/60 shadow-[0_4px_24px_rgba(0,0,0,0.02)] h-full text-[13px] overflow-hidden">

      {activeSessionId && <SessionHeader />}

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
                    <div className="max-w-[85%] bg-primary/10 dark:bg-primary/20 rounded-lg px-3.5 py-2.5 text-on-surface dark:text-on-canvas-dark text-[12.5px] leading-relaxed shadow-sm">
                      {msg.parts.filter((p) => p.type === 'text').map((p) => (p as { content: string }).content).join('')}
                    </div>
                  </div>
                ) : (
                  <div key={msg.id} className="flex gap-2 items-start">
                    <div className="w-6 h-6 flex-shrink-0 rounded-md bg-gradient-to-br from-orange-400 via-pink-500 to-indigo-500 text-white font-bold text-[10px] flex items-center justify-center shadow-sm">
                      W
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={
                        isPendingOnly(msg)
                          ? 'flex items-center min-h-[24px] text-on-surface dark:text-on-canvas-dark'
                          : 'pt-0.5 text-on-surface dark:text-on-canvas-dark text-[12.5px] leading-relaxed'
                      }>
                        {msg.parts.map((part, i) => {
                          if (part.type === 'pending') {
                            return <PendingStar key={`pending-${i}`} />;
                          }
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
                            const streaming = streamingIds.has(msg.id) && i === msg.parts.length - 1;
                            return (
                              <StreamingText
                                key={`text-${i}`}
                                target={part.content}
                                streaming={streaming}
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
                                className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger dark:border-danger/30 dark:bg-danger/10 dark:text-danger"
                              >
                                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                                <div>
                                  <span className="font-medium">Error ({part.code})</span>
                                  <span className="ml-1">{part.message}</span>
                                </div>
                              </div>
                            );
                          }
                          if (part.type === 'permission') {
                            return (
                              <PermissionCard key={`perm-${part.requestId}`} part={part} onDecide={decidePermission} />
                            );
                          }
                          if (part.type === 'subagent') {
                            const label =
                              part.status === 'completed' ? `${part.name} 执行完成`
                              : part.status === 'error' ? `${part.name} 执行出错`
                              : `${part.name} 开始执行`;
                            return (
                              <div
                                key={`subagent-${i}`}
                                className="flex items-center gap-1.5 py-0.5 text-[11.5px] text-on-surface-muted dark:text-on-canvas-dark-muted"
                              >
                                <span className="inline-block w-1 h-1 rounded-full flex-shrink-0"
                                  style={{ background: part.status === 'error' ? 'var(--color-danger)' : part.status === 'completed' ? 'var(--color-success)' : 'var(--color-warning)' }}
                                />
                                <span>{label}</span>
                              </div>
                            );
                          }
                          return null;
                        })}
                        {msg.interrupted && (
                          <span className="inline-block ml-1 text-[11.5px] text-on-surface-muted dark:text-on-canvas-dark-muted italic">
                            {t('agent.interruptedMarker')}
                          </span>
                        )}
                      </div>
                      {!streamingIds.has(msg.id) && (
                        <MessageActionBar
                          content={msg.parts.filter((p) => p.type === 'text').map((p) => (p as { content: string }).content).join('')}
                          messageId={msg.id}
                        />
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
              aria-label={t('agent.scrollToBottom')}
              className={`absolute bottom-2 right-3 p-1.5 rounded-full bg-surface dark:bg-surface-dark-muted border border-outline/60 dark:border-outline-dark shadow-sm text-on-surface-muted dark:text-on-canvas-dark-muted hover:text-on-surface dark:hover:text-on-canvas-dark hover:bg-surface-muted dark:hover:bg-surface-dark-muted transition-all duration-200 ${isAtBottom ? 'opacity-0 pointer-events-none' : 'opacity-100 pointer-events-auto'}`}
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
            <>
              <div className="text-center mb-4">
                <div className="w-10 h-10 mx-auto rounded-lg bg-gradient-to-br from-orange-400 via-pink-500 to-indigo-500 text-white font-bold text-sm flex items-center justify-center shadow-sm mb-3">W</div>
                <p className="text-on-surface-muted dark:text-on-canvas-dark-muted text-[12px]">{t('agent.welcome')}</p>
              </div>
              {activeSessionId ? (
                inputBox
              ) : (
                // No active session (empty project, or the last one was just
                // deleted): any local directory is a valid project, so just offer
                // to start a fresh session. Project switching lives in the TitleBar.
                <button
                  type="button"
                  onClick={() => void newSession()}
                  disabled={agent.status !== 'connected'}
                  className="flex w-full items-center justify-center gap-2 rounded-md border border-outline bg-surface px-3 py-2.5 text-[12.5px] font-semibold text-on-surface transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50 dark:border-outline-dark dark:bg-surface-dark dark:text-on-canvas-dark dark:hover:bg-surface-dark-muted"
                >
                  <Plus className="h-4 w-4" />
                  <span>{t('agent.newSession')}</span>
                </button>
              )}
            </>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="px-3 pb-3 pt-1 flex items-center justify-between border-t border-outline/50 dark:border-outline-dark/60">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-orange-400 via-pink-500 to-indigo-500 flex-shrink-0 flex items-center justify-center text-[10px] text-white font-bold shadow-sm">W</div>
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${AGENT_STATUS_DOT[agent.status]}`} title={statusTitle(agent)} />
          <span className="text-[12.5px] font-semibold text-on-surface dark:text-on-canvas-dark truncate max-w-[120px]">wallfacers</span>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setModalOpen(true)} className="p-1.5 rounded-sm hover:bg-canvas/80 dark:hover:bg-surface-dark-muted text-on-surface-muted dark:text-on-canvas-dark-muted transition-colors" title={t('tasks.title')} aria-label={t('agent.openTaskList')}><LayoutList className="w-4 h-4" /></button>
          <button type="button" onClick={() => setSettingsOpen(true)} className="p-1.5 rounded-sm hover:bg-canvas/80 dark:hover:bg-surface-dark-muted text-on-surface-muted dark:text-on-canvas-dark-muted transition-colors" title={t('settings.title')} aria-label={t('agent.openSettings')}><Settings className="w-4 h-4" /></button>
        </div>
      </div>

      {modalOpen && <TaskListModal onClose={() => setModalOpen(false)} onSelect={handleSelectTask} />}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
