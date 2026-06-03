/**
 * Shared motion presets for the smooth-panel-animations change.
 *
 * Every animated surface in the app uses these values so the motion
 * language stays unified. Durations are short for a snappy, responsive feel.
 *
 * @see openspec/changes/smooth-panel-animations/design.md D2
 */

// Fast ease-out: decelerate quickly, stops clean.
const EASE = [0.16, 1, 0.3, 1] as const;

/** Right panel (工作台) open/close. */
export const PANEL = {
  duration: 0.18,
  ease: EASE,
} as const;

/** Terminal tab items — small elements, snappy. */
export const TAB = {
  duration: 0.12,
  ease: EASE,
  enter: { opacity: 0, scale: 0.9 },
  exit: { opacity: 0, scale: 0.9 },
} as const;

/** Tab-content cross-fade and button opacity toggle. */
export const FADE = {
  duration: 0.1,
  ease: 'easeOut' as const,
} as const;

/** Split pane (分屏) enter/exit. */
export const SPLIT = {
  duration: 0.15,
  ease: EASE,
  enter: { opacity: 0, scale: 0.97 },
  exit: { opacity: 0, scale: 0.97 },
} as const;
