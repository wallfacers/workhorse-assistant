import { useCallback, useLayoutEffect, useRef, useState } from 'react';

/**
 * Auto-scroll hook — jitter-free follow-the-bottom for chat message lists.
 *
 * Ported from data-talk's frame-level suppression mechanism:
 *   - `useAutoScroll(deps, resetDeps)` signature
 *   - Frame-level mutation suppression coalesces layout-effect + observer scrolls
 *   - `scheduleFollow()` rAF guard: ≤ one follow-scroll per frame
 *   - `ResizeObserver` shares the same `handleContentGrowth` handler
 *   - Strict-bottom re-engage (≤ 2px)
 *   - Wheel + touch upward-intent detection pauses following
 *   - Two `useLayoutEffect`s: deps → structural scroll; resetDeps → forced re-follow
 */

const STRICT_BOTTOM_PX = 2;

interface AutoScroll {
  /** Callback ref — attach to the scroll container element. */
  ref: (el: HTMLDivElement | null) => void;
  /** True when the container is within STRICT_BOTTOM_PX of the bottom. */
  isAtBottom: boolean;
  /** Scroll to the very bottom immediately (also re-enables following). */
  scrollToBottom: () => void;
}

export function useAutoScroll(
  deps: React.DependencyList,
  resetDeps: React.DependencyList,
): AutoScroll {
  const [isAtBottom, setIsAtBottom] = useState(true);

  // --- Refs ---
  const containerEl = useRef<HTMLDivElement | null>(null);
  const following = useRef(true);
  const lastScrollTop = useRef(0);

  // Mutation suppression
  const suppressMutationScrolls = useRef(false);
  const pendingFollowAfterSuppression = useRef(false);
  const releaseMutationSuppressionFrame = useRef<number | null>(null);

  // rAF follow dedup
  const followFrame = useRef<number | null>(null);

  // Observers (stored so cleanup can disconnect)
  const mutationObserver = useRef<MutationObserver | null>(null);
  const resizeObserver = useRef<ResizeObserver | null>(null);

  // Touch tracking
  const touchStartY = useRef<number | null>(null);

  // --- Helpers ---

  const distanceFromBottom = useCallback(() => {
    const el = containerEl.current;
    if (!el) return 0;
    return el.scrollHeight - el.scrollTop - el.clientHeight;
  }, []);

  const doScrollToBottom = useCallback(() => {
    const el = containerEl.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    following.current = true;
    setIsAtBottom(true);
  }, []);

  // --- scheduleFollow: rAF-deduped follow scroll (≤1 per frame) ---

  const scheduleFollow = useCallback(() => {
    if (followFrame.current !== null) return; // already scheduled
    followFrame.current = requestAnimationFrame(() => {
      followFrame.current = null;
      if (!following.current) return;
      doScrollToBottom();
    });
  }, [doScrollToBottom]);

  // --- handleContentGrowth: shared handler for mutation + resize ---

  const handleContentGrowth = useCallback(() => {
    if (!following.current) return;
    scheduleFollow();
  }, [scheduleFollow]);

  // --- suppressMutationsUntilNextFrame ---

  const suppressMutationsUntilNextFrame = useCallback(() => {
    suppressMutationScrolls.current = true;
    pendingFollowAfterSuppression.current = false;
    if (releaseMutationSuppressionFrame.current !== null) {
      cancelAnimationFrame(releaseMutationSuppressionFrame.current);
    }
    releaseMutationSuppressionFrame.current = requestAnimationFrame(() => {
      releaseMutationSuppressionFrame.current = null;
      suppressMutationScrolls.current = false;
      if (pendingFollowAfterSuppression.current) {
        pendingFollowAfterSuppression.current = false;
        handleContentGrowth();
      }
    });
  }, [handleContentGrowth]);

  // --- Callback ref (sets up / tears down observers) ---

  const ref = useCallback(
    (el: HTMLDivElement | null) => {
      // Tear down previous observers
      mutationObserver.current?.disconnect();
      resizeObserver.current?.disconnect();
      containerEl.current = el;
      if (!el) return;

      // MutationObserver: detect content growth → scroll if following
      const mo = new MutationObserver(() => {
        if (suppressMutationScrolls.current) {
          // Record a pending follow instead of scrolling immediately
          if (following.current) {
            pendingFollowAfterSuppression.current = true;
          }
          return;
        }
        handleContentGrowth();
      });
      mo.observe(el, { childList: true, subtree: true, characterData: true });
      mutationObserver.current = mo;

      // ResizeObserver: late layout changes (highlight, images)
      const ro = new ResizeObserver(() => {
        if (suppressMutationScrolls.current) {
          if (following.current) {
            pendingFollowAfterSuppression.current = true;
          }
          return;
        }
        handleContentGrowth();
      });
      ro.observe(el);
      resizeObserver.current = ro;

      // --- Wheel listener: upward intent → pause following ---
      const onWheel = (e: WheelEvent) => {
        if (e.deltaY < 0) {
          following.current = false;
          setIsAtBottom(false);
        }
      };
      el.addEventListener('wheel', onWheel, { passive: true });

      // --- Touch listeners: downward finger → pause following ---
      const onTouchStart = (e: TouchEvent) => {
        touchStartY.current = e.touches[0]?.clientY ?? null;
      };
      const onTouchMove = (e: TouchEvent) => {
        if (touchStartY.current === null) return;
        const currentY = e.touches[0]?.clientY;
        if (currentY === undefined) return;
        // Finger moving down = scrolling content up
        if (currentY < touchStartY.current) {
          following.current = false;
          setIsAtBottom(false);
        }
      };
      const onTouchEnd = () => {
        touchStartY.current = null;
      };
      el.addEventListener('touchstart', onTouchStart, { passive: true });
      el.addEventListener('touchmove', onTouchMove, { passive: true });
      el.addEventListener('touchend', onTouchEnd, { passive: true });

      // --- Scroll listener: strict-bottom re-engage ---
      const onScroll = () => {
        const prevTop = lastScrollTop.current;
        const el2 = containerEl.current;
        if (!el2) return;
        const currentTop = el2.scrollTop;
        const movedUp = currentTop < prevTop;
        const dist = distanceFromBottom();
        lastScrollTop.current = currentTop;

        if (movedUp && dist > 0) {
          following.current = false;
          setIsAtBottom(false);
        } else if (dist <= STRICT_BOTTOM_PX) {
          following.current = true;
          setIsAtBottom(true);
        } else {
          setIsAtBottom(false);
        }
      };
      el.addEventListener('scroll', onScroll, { passive: true });

      // Store cleanup on the element (the ref callback itself handles cleanup
      // by disconnecting observers at the top). The event listeners will be
      // garbage-collected with the element. For a more explicit cleanup, we
      // could use a WeakMap, but the callback-ref pattern guarantees the old
      // element's observers are disconnected when a new ref arrives.
    },
    [handleContentGrowth, distanceFromBottom],
  );

  // --- useLayoutEffect: deps → structural scroll + suppression ---

  useLayoutEffect(() => {
    // Suppress mutation-driven scrolls for this frame so the layout-effect
    // scroll and the observer scroll coalesce into one.
    suppressMutationsUntilNextFrame();
    if (following.current) {
      doScrollToBottom();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // --- useLayoutEffect: resetDeps → forced re-follow + scroll ---

  useLayoutEffect(() => {
    following.current = true;
    suppressMutationsUntilNextFrame();
    doScrollToBottom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, resetDeps);

  // Cleanup on unmount
  useLayoutEffect(() => {
    return () => {
      mutationObserver.current?.disconnect();
      resizeObserver.current?.disconnect();
      if (followFrame.current !== null) cancelAnimationFrame(followFrame.current);
      if (releaseMutationSuppressionFrame.current !== null) {
        cancelAnimationFrame(releaseMutationSuppressionFrame.current);
      }
    };
  }, []);

  const scrollToBottom = useCallback(() => {
    following.current = true;
    doScrollToBottom();
  }, [doScrollToBottom]);

  return { ref, scrollToBottom, isAtBottom };
}
