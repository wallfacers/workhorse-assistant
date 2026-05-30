import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

/**
 * Auto-scroll hook inspired by data-talk's `use-auto-scroll.ts`.
 *
 * Uses MutationObserver (not React state deps) to detect content growth and
 * scroll to bottom synchronised with browser paint (RAF). A wheel-listener
 * detects upward scroll intent and pauses following until the user sends a
 * new message (via `resetFollow()`) or clicks the scroll-to-bottom button.
 *
 * Anti-jitter techniques ported from data-talk:
 *   - MutationObserver fires before React state → one frame less latency
 *   - RAF scheduling → synchronous with browser paint
 *   - FOLLOW_THRESHOLD (120 px) → stays anchored if close to bottom
 *   - `overflow-anchor: auto` in CSS handles content-above changes
 */

const FOLLOW_THRESHOLD_PX = 120;

interface AutoScroll {
  /** True when the container is within FOLLOW_THRESHOLD of the bottom. */
  isAtBottom: boolean;
  /** Scroll to the very bottom immediately. */
  scrollToBottom: () => void;
  /** Call when the user sends a new message — re-enables following. */
  resetFollow: () => void;
}

export function useAutoScroll(containerRef: RefObject<HTMLDivElement | null>): AutoScroll {
  const [isAtBottom, setIsAtBottom] = useState(true);
  const following = useRef(true);
  const rafId = useRef<number | null>(null);
  const suppressWheelRef = useRef(false);

  const measureBottom = useCallback(() => {
    const el = containerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < FOLLOW_THRESHOLD_PX;
  }, [containerRef]);

  const scrollToBottom = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    // Use instant (not smooth) to avoid mid-animation jitter
    el.scrollTop = el.scrollHeight;
    setIsAtBottom(true);
    following.current = true;
  }, [containerRef]);

  const resetFollow = useCallback(() => {
    following.current = true;
    // Immediately scroll to bottom on new send
    scrollToBottom();
  }, [scrollToBottom]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // --- MutationObserver: detect content growth → scroll if following ---
    const mo = new MutationObserver(() => {
      if (!following.current) return;
      // Cancel any pending RAF to coalesce rapid mutations
      if (rafId.current !== null) cancelAnimationFrame(rafId.current);
      rafId.current = requestAnimationFrame(() => {
        rafId.current = null;
        if (!following.current) return;
        el.scrollTop = el.scrollHeight;
        setIsAtBottom(true);
      });
    });
    mo.observe(el, { childList: true, subtree: true, characterData: true });

    // --- Wheel listener: detect upward scroll intent → stop following ---
    const onWheel = (e: WheelEvent) => {
      if (suppressWheelRef.current) return;
      if (e.deltaY < 0 && following.current) {
        // User scrolled up → stop following
        following.current = false;
        setIsAtBottom(false);
      }
    };
    el.addEventListener('wheel', onWheel, { passive: true });

    // --- Scroll listener: update isAtBottom state ---
    const onScroll = () => {
      const atBottom = measureBottom();
      setIsAtBottom(atBottom);
      if (atBottom) following.current = true;
    };
    el.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      mo.disconnect();
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('scroll', onScroll);
      if (rafId.current !== null) cancelAnimationFrame(rafId.current);
    };
  }, [containerRef, measureBottom]);

  return { isAtBottom, scrollToBottom, resetFollow };
}
