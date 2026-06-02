import { useRef, useState, useCallback } from 'react';
import { Check, Copy, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { writeClipboardText } from '../../ipc/clipboard';
import { submitFeedback } from '../../ipc/feedback';

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
  // Tracks which button (if any) is currently in its "confirmed" state.
  const [confirmed, setConfirmed] = useState<ActionKey | null>(null);
  // Idempotency: remember which feedback keys have already been submitted.
  const submitted = useRef<Set<string>>(new Set());

  const confirm = useCallback((key: ActionKey) => {
    setConfirmed(key);
    setTimeout(() => setConfirmed(null), CONFIRM_MS);
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
    },
    [messageId, conversationId, confirm],
  );

  return (
    <div className="flex items-center gap-2 mt-1.5 ml-1 text-gray-400 dark:text-gray-500">
      <button
        className="p-0.5 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
        title={t('agent.feedback.copy')}
        onClick={handleCopy}
      >
        {confirmed === 'copy' ? (
          <Check className="w-3 h-3 text-green-500" />
        ) : (
          <Copy className="w-3 h-3" />
        )}
      </button>
      <button
        className="p-0.5 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
        title={t('agent.feedback.good')}
        onClick={() => handleFeedback('like')}
      >
        {confirmed === 'like' ? (
          <Check className="w-3 h-3 text-green-500" />
        ) : (
          <ThumbsUp className="w-3 h-3" />
        )}
      </button>
      <button
        className="p-0.5 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
        title={t('agent.feedback.bad')}
        onClick={() => handleFeedback('dislike')}
      >
        {confirmed === 'dislike' ? (
          <Check className="w-3 h-3 text-green-500" />
        ) : (
          <ThumbsDown className="w-3 h-3" />
        )}
      </button>
    </div>
  );
}
