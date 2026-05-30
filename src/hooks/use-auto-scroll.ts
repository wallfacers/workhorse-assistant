import { useCallback, useLayoutEffect, useRef, useState } from 'react';

/**
 * Auto-scroll hook — jitter-free follow-the-bottom for chat message lists.
 *
 * Ported from data-talk's frame-level suppression mechanism:
 *   - `useAutoScroll(deps, resetDeps)` signature
 *   - Frame-level mutation suppression coalesces layout-effect + observer scrolls
 *   - `scheduleFollow()` rAF guard: ≤ one follow-scroll per frame
 *   - `ResizeObserver` shares the same `handleContentGrowth` handler
 *   - Re-engage threshold (≤ 60px from bottom)
 *   - Wheel + touch upward-intent detection pauses following (with micro-delta threshold)
 *   - Two `useLayoutEffect`s: deps → structural scroll; resetDeps → forced re-follow
 */

/** Re-engage threshold: scroll within this distance of the bottom to resume following. */
const RE_ENGAGE_PX = 60;
/** Wheel threshold: ignore micro-deltas (e.g. trackpad jitter) smaller than this. */
const WHEEL_THRESHOLD = -3;

interface AutoScroll {
  /** Callback ref — attach to the scroll container element. */
  ref: (el: HTMLDivElement | null) => void;
  /** True when the container is near the bottom (within re-engage threshold). */
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

  // Event listeners (stored so cleanup can remove them)
  const listenersRef = useRef<Array<[HTMLElement, string, EventListener, boolean | AddEventListenerOptions]>>([]);

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
      // Tear down previous observers and event listeners
      mutationObserver.current?.disconnect();
      resizeObserver.current?.disconnect();
      listenersRef.current.forEach(([prevEl, evt, fn, opts]) => prevEl.removeEventListener(evt, fn, opts));
      listenersRef.current = [];
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

      // Helper: add a tracked event listener (cleaned up on element change).
      const addListener = (evt: string, fn: EventListener, opts?: boolean | AddEventListenerOptions) => {
        const o = opts ?? { passive: true };
        el.addEventListener(evt, fn, o);
        listenersRef.current.push([el, evt, fn, o]);
      };

      // --- Wheel listener: upward intent → pause following ---
      const onWheel = (e: WheelEvent) => {
        if (e.deltaY < WHEEL_THRESHOLD) {
          following.current = false;
          setIsAtBottom(false);
        }
      };
      addListener('wheel', onWheel as EventListener);

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
      addListener('touchstart', onTouchStart as EventListener);
      addListener('touchmove', onTouchMove as EventListener);
      addListener('touchend', onTouchEnd as EventListener);

      // --- Scroll listener: re-engage when near bottom ---
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
        } else if (dist <= RE_ENGAGE_PX) {
          following.current = true;
          setIsAtBottom(true);
        } else {
          setIsAtBottom(false);
        }
      };
      addListener('scroll', onScroll as EventListener);
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
      listenersRef.current.forEach(([el, evt, fn, opts]) => el.removeEventListener(evt, fn, opts));
      listenersRef.current = [];
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
