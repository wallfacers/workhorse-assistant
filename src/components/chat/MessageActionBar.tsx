import { useEffect, useRef, useState, useCallback } from 'react';
import { Check, Copy, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { writeClipboardText } from '../../ipc/clipboard';
import { submitFeedback } from '../../ipc/feedback';
import { useToast } from '../ToastProvider';

export interface MessageActionBarProps {
  /** Plain-text content of the assistant message (for copy). */
  content: string;
  /** Unique identifier of the message. */
  messageId: string;
  /** Optional conversation / session identifier. */
  conversationId?: string;
}

/** Confirmation-state duration in milliseconds. */
const CONFIRM_MS = 2000;

type ActionKey = 'copy' | 'like' | 'dislike';

/**
 * Action bar rendered below an assistant message after streaming ends.
 * Provides copy-to-clipboard, like, and dislike with visual confirmation.
 */
export default function MessageActionBar({
  content,
  messageId,
  conversationId,
}: MessageActionBarProps) {
  const { t } = useTranslation();
  const toast = useToast();
  // Tracks which button (if any) is currently in its "confirmed" state.
  const [confirmed, setConfirmed] = useState<ActionKey | null>(null);
  // Idempotency: remember which feedback keys have already been submitted.
  const submitted = useRef<Set<string>>(new Set());
  // Holds the pending "confirmed" reset timer so it can be cleared on a repeat
  // click or on unmount (avoids a leaked timer / setState after unmount).
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const confirm = useCallback((key: ActionKey) => {
    setConfirmed(key);
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setConfirmed(null), CONFIRM_MS);
  }, []);

  useEffect(() => () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
  }, []);

  const handleCopy = useCallback(() => {
    void writeClipboardText(content).then((result) => {
      if (result.ok) confirm('copy');
    });
  }, [content, confirm]);

  const handleFeedback = useCallback(
    (type: 'like' | 'dislike') => {
      confirm(type);
      const key = `${messageId}:${type}`;
      if (submitted.current.has(key)) return; // idempotent
      submitted.current.add(key);
      void submitFeedback({
        messageId,
        type,
        timestamp: Date.now(),
        conversationId,
      });
      toast({ message: t('toast.feedbackThanks'), level: 'success' });
    },
    [messageId, conversationId, confirm, toast],
  );

  return (
    <div className="flex items-center gap-2 mt-1.5 ml-1 text-on-surface-muted dark:text-on-canvas-dark-muted">
      <button
        className="p-0.5 hover:text-on-surface dark:hover:text-on-canvas-dark transition-colors"
        title={t('agent.feedback.copy')}
        onClick={handleCopy}
      >
        {confirmed === 'copy' ? (
          <Check className="w-3 h-3 text-success" />
        ) : (
          <Copy className="w-3 h-3" />
        )}
      </button>
      <button
        className="p-0.5 hover:text-on-surface dark:hover:text-on-canvas-dark transition-colors"
        title={t('agent.feedback.good')}
        onClick={() => handleFeedback('like')}
      >
        {confirmed === 'like' ? (
          <Check className="w-3 h-3 text-success" />
        ) : (
          <ThumbsUp className="w-3 h-3" />
        )}
      </button>
      <button
        className="p-0.5 hover:text-on-surface dark:hover:text-on-canvas-dark transition-colors"
        title={t('agent.feedback.bad')}
        onClick={() => handleFeedback('dislike')}
      >
        {confirmed === 'dislike' ? (
          <Check className="w-3 h-3 text-success" />
        ) : (
          <ThumbsDown className="w-3 h-3" />
        )}
      </button>
    </div>
  );
}
