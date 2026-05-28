import type { ProfileId } from '../../ipc';

/**
 * Single source of truth mapping each canonical `ProfileId` to its display
 * label (design D6). The picker renders these labels, but selection always
 * yields the `ProfileId` — never the `+`-style display string — so `pty_spawn`
 * and the reducer receive the hyphenated id the core's profile map expects.
 */
export const PROFILE_LABELS: Record<ProfileId, string> = {
  terminal: 'terminal',
  'claude-opus': 'claude+opus',
  'claude-glm': 'claude+GLM',
  codex: 'codex',
};

/** Order the picker lists profiles in. */
export const PROFILE_ORDER: ProfileId[] = [
  'terminal',
  'claude-opus',
  'claude-glm',
  'codex',
];
