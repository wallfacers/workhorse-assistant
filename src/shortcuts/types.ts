import { isMac, modDisplay } from './platform';

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

/** Every shortcut action the app recognises. */
export type ShortcutAction =
  | 'newTask'
  | 'globalSearch'
  | 'openSettings'
  | 'closePanel'
  | 'toggleSidebar'
  | 'newTerminal'
  | 'splitTerminal'
  | 'sendMessage'
  | 'showShortcuts'
  | 'cancelClose';

/**
 * Platform-independent representation of a key combination.
 *
 * `mod` is the primary modifier — Command on macOS, Ctrl on Windows/Linux.
 * `code` is the physical key code (`KeyboardEvent.code`, e.g. `"KeyN"`).
 */
export interface KeyBinding {
  mod: boolean;
  alt: boolean;
  shift: boolean;
  code: string;
}

export interface ShortcutConfig {
  bindings: Record<ShortcutAction, KeyBinding>;
}

// ---------------------------------------------------------------------------
// Default bindings
// ---------------------------------------------------------------------------

export const DEFAULT_SHORTCUTS: ShortcutConfig = {
  bindings: {
    newTask:        { mod: true,  alt: false, shift: false, code: 'KeyN' },
    globalSearch:   { mod: true,  alt: false, shift: false, code: 'KeyK' },
    openSettings:   { mod: true,  alt: false, shift: false, code: 'Comma' },
    closePanel:     { mod: true,  alt: false, shift: false, code: 'KeyW' },
    toggleSidebar:  { mod: true,  alt: false, shift: false, code: 'Backslash' },
    newTerminal:    { mod: true,  alt: false, shift: false, code: 'KeyT' },
    splitTerminal:  { mod: true,  alt: false, shift: false, code: 'KeyD' },
    sendMessage:    { mod: true,  alt: false, shift: false, code: 'Enter' },
    showShortcuts:  { mod: true,  alt: false, shift: false, code: 'Slash' },
    cancelClose:    { mod: false, alt: false, shift: false, code: 'Escape' },
  },
};

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export const STORAGE_KEY = 'workhorse:shortcuts';

// ---------------------------------------------------------------------------
// Action display names (i18n keys)
// ---------------------------------------------------------------------------

export const SHORTCUT_ACTION_I18N: Record<ShortcutAction, string> = {
  newTask:        'shortcuts.newTask',
  globalSearch:   'shortcuts.globalSearch',
  openSettings:   'shortcuts.openSettings',
  closePanel:     'shortcuts.closePanel',
  toggleSidebar:  'shortcuts.toggleSidebar',
  newTerminal:    'shortcuts.newTerminal',
  splitTerminal:  'shortcuts.splitTerminal',
  sendMessage:    'shortcuts.sendMessage',
  showShortcuts:  'shortcuts.showShortcuts',
  cancelClose:    'shortcuts.cancelClose',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Platform-aware human-readable display string for a keybinding. */
export function keyDisplay(binding: KeyBinding): string {
  const mac = isMac();
  const key = codeToLabel(binding.code, mac);
  return modDisplay(binding.mod, binding.alt, binding.shift, key);
}

/** Map a `KeyboardEvent.code` to a human-readable key label. */
function codeToLabel(code: string, mac: boolean): string {
  switch (code) {
    case 'Comma': return ',';
    case 'Period': return '.';
    case 'Slash': return '/';
    case 'Backslash': return '\\';
    case 'Enter': return mac ? '↩' : 'Enter';
    case 'Escape': return 'Esc';
    case 'Space': return mac ? '␣' : 'Space';
    case 'Tab': return mac ? '⇥' : 'Tab';
    case 'ArrowUp': return '↑';
    case 'ArrowDown': return '↓';
    case 'ArrowLeft': return '←';
    case 'ArrowRight': return '→';
    default:
      // `KeyN` → `N`, `Digit1` → `1`
      return code.replace(/^(Key|Digit)/, '');
  }
}

/**
 * Check whether a `KeyboardEvent` matches a `KeyBinding`.
 * `isMac` must be passed in so callers control when the value is read.
 */
export function matchBinding(
  e: KeyboardEvent,
  binding: KeyBinding,
  mac: boolean,
): boolean {
  if (e.code !== binding.code) return false;
  const primary = mac ? e.metaKey : e.ctrlKey;
  if (binding.mod !== primary) return false;
  if (binding.alt !== e.altKey) return false;
  if (binding.shift !== e.shiftKey) return false;
  return true;
}

/** Deep-clone a ShortcutConfig so mutations don't leak. */
export function cloneConfig(c: ShortcutConfig): ShortcutConfig {
  return { bindings: { ...c.bindings } };
}
