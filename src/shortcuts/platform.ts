/**
 * Platform detection for keyboard shortcut display and matching.
 *
 * macOS uses the Command (⌘) key as the primary modifier; Windows and Linux use
 * Ctrl. This module provides a single `isMac()` predicate and display helpers so
 * the rest of the shortcut system stays platform-agnostic.
 */

let _cached: boolean | null = null;

/** Detect macOS from the navigator platform string. */
export function isMac(): boolean {
  if (_cached === null) {
    _cached =
      /Mac|iPod|iPhone|iPad/.test(
        (navigator as any).userAgentData?.platform ?? navigator.platform ?? '',
      );
  }
  return _cached;
}

/** Human-readable label for the primary modifier key. */
export function modLabel(): string {
  return isMac() ? '⌘' : 'Ctrl';
}

/**
 * Format a modifier combination for display.
 * `mod` is true when the primary modifier (⌘/Ctrl) is held.
 */
export function modDisplay(mod: boolean, alt: boolean, shift: boolean, key: string): string {
  const parts: string[] = [];
  if (mod) parts.push(modLabel());
  if (alt) parts.push(isMac() ? '⌥' : 'Alt');
  if (shift) parts.push(isMac() ? '⇧' : 'Shift');
  parts.push(key);
  return parts.join('');
}
