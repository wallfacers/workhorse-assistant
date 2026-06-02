/**
 * Message feedback infrastructure.
 *
 * Provides the data type and submission function for user feedback
 * (like / dislike) on assistant messages.  The current implementation
 * logs structured data to the console; swap the body of
 * `submitFeedback` for a Rust IPC command when the backend is ready.
 */

/** Structured feedback payload for a single assistant message. */
export interface FeedbackData {
  /** The message the feedback applies to. */
  messageId: string;
  /** Whether the user liked or disliked the response. */
  type: 'like' | 'dislike';
  /** Unix timestamp (ms) when the feedback was submitted. */
  timestamp: number;
  /** Optional conversation/session identifier. */
  conversationId?: string;
}

/**
 * Submit feedback for an assistant message.
 *
 * Current stage: console logging only.  Replace the body with a
 * Tauri `invoke("submit_feedback", …)` call when the Rust side is
 * implemented.
 */
export async function submitFeedback(data: FeedbackData): Promise<void> {
  // Placeholder — structured log for development.
  console.info('[feedback]', data);
}
