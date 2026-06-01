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
  wsl: 'WSL',
};

/**
 * Order the picker lists profiles in. `wsl` is intentionally absent: it is not a
 * manually-picked profile (it would fail "command not found" on a non-Windows
 * host). Instead a `terminal` pane launches as `wsl` automatically when the
 * sidecar reports it runs under WSL (add-wsl-remote C3, see `Terminal.tsx`).
 */
export const PROFILE_ORDER: ProfileId[] = [
  'terminal',
  'claude-opus',
  'claude-glm',
  'codex',
];
