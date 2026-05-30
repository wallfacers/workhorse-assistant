import { useEffect, useRef, useState } from 'react';
import { ChevronRight, Lock } from 'lucide-react';
import MarkdownContent from './MarkdownContent';

/**
 * Collapsible "thinking" section for an assistant message's reasoning part.
 *
 * Mirrors data-talk's `reasoning-part.tsx`:
 *   - default collapsed; toggling the header expands/collapses the body
 *   - while streaming, the header shows a shimmering "思考中…" label
 *   - once done, it shows the thought duration ("深度思考 N 秒")
 *   - the `autoExpand` display preference auto-opens on stream start and
 *     auto-collapses on completion (display only — never toggles thinking)
 *   - a redacted block (no deltas) renders a lock marker instead of text
 *
 * The reasoning body reuses {@link MarkdownContent}; it benefits from the
 * streaming code-fence bypass once `agent-chat-polish` lands.
 */

interface ReasoningPartProps {
  text: string;
  status: 'streaming' | 'done';
  redacted?: boolean;
  startedAt?: number;
  endedAt?: number;
  /** Display preference: auto-expand while thinking, auto-collapse when done. */
  autoExpand: boolean;
}

export default function ReasoningPart({
  text,
  status,
  redacted = false,
  startedAt,
  endedAt,
  autoExpand,
}: ReasoningPartProps) {
  const [open, setOpen] = useState(false);
  const wasStreaming = useRef(false);

  const streaming = status === 'streaming';

  // Auto-expand on transition into streaming; auto-collapse on transition out.
  // Display-only — gated by the user preference, sends nothing to the sidecar.
  useEffect(() => {
    if (streaming && !wasStreaming.current) {
      setOpen(autoExpand);
    } else if (!streaming && wasStreaming.current) {
      setOpen(false);
    }
    wasStreaming.current = streaming;
  }, [streaming, autoExpand]);

  const durationSec =
    startedAt != null && endedAt != null
      ? Math.max(1, Math.round((endedAt - startedAt) / 1000))
      : null;

  const label = streaming
    ? '思考中…'
    : redacted
      ? '已隐藏的推理'
      : durationSec != null
        ? `深度思考 ${durationSec} 秒`
        : '深度思考';

  return (
    <div data-component="reasoning-part" className="mb-2 flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-fit items-center gap-1 text-[11.5px] font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
      >
        <ChevronRight
          className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
        />
        <span className={streaming ? 'animate-pulse' : ''}>{label}</span>
      </button>

      {open && (
        <div className="pl-[19px] text-[12px] leading-relaxed text-gray-500 dark:text-gray-400">
          {redacted ? (
            <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-500 italic">
              <Lock className="w-3 h-3 flex-shrink-0" />
              <span>此推理块已加密（redacted），内容不可见</span>
            </div>
          ) : (
            <MarkdownContent content={text} streaming={streaming} />
          )}
        </div>
      )}
    </div>
  );
}
