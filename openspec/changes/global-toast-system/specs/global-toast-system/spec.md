## ADDED Requirements

### Requirement: App-level imperative toast service

The app SHALL provide a `ToastProvider` mounted once at the app root exposing an
imperative hook `useToast()` that returns a function `toast(options)`. The options
SHALL include `message` (string), `level` (`success` | `info` | `warning` | `error`),
and an optional `duration` override (milliseconds). The function SHALL NOT return a
value — it fires and forgets.

#### Scenario: Fire a success toast

- **WHEN** a caller invokes `toast({ message: '已删除', level: 'success' })`
- **THEN** a toast card appears in the top-right corner with the message text and
  success visual treatment

#### Scenario: Fire an error toast

- **WHEN** a caller invokes `toast({ message: '删除失败', level: 'error' })`
- **THEN** a toast card appears with error visual treatment and no auto-dismiss timer

#### Scenario: Custom duration override

- **WHEN** a caller invokes `toast({ message: '处理中...', level: 'info', duration: 8000 })`
- **THEN** the toast auto-dismisses after 8 seconds instead of the default 3 seconds

### Requirement: Toast rendering with neutral surface and semantic color bar

Each toast card SHALL render with a `surface` background, a 3px left border in the
semantic color matching its level, and a 1px `outline` border. The card SHALL display
a small level icon (✓ success, ℹ info, ⚠ warning, ✕ error) followed by the message
text in `body-sm` typography.

#### Scenario: Success toast visual treatment

- **WHEN** a success toast is rendered
- **THEN** the card has `surface` background, a 3px left border in `--color-success`
  (`#1F7A5A`), a ✓ icon, and 1px `outline` border

#### Scenario: Error toast visual treatment

- **WHEN** an error toast is rendered
- **THEN** the card has `surface` background, a 3px left border in `--color-danger`
  (`#B3261E`), a ✕ icon, and 1px `outline` border

#### Scenario: Warning toast visual treatment

- **WHEN** a warning toast is rendered
- **THEN** the card has `surface` background, a 3px left border in `--color-warning`
  (`#B4731B`), a ⚠ icon, and 1px `outline` border

#### Scenario: Info toast visual treatment

- **WHEN** an info toast is rendered
- **THEN** the card has `surface` background, a 3px left border in `--color-accent-warm`
  (`#0B6477`), a ℹ icon, and 1px `outline` border

### Requirement: Toast stacking with maximum cap

The toast container SHALL stack up to 5 toast cards vertically in the top-right
corner of the viewport. When a 6th toast arrives, the oldest (bottom-most) toast
SHALL be immediately dismissed.

#### Scenario: Stack three toasts

- **WHEN** three toasts are fired in quick succession
- **THEN** all three are visible, newest at top, oldest at bottom

#### Scenario: Exceed stack cap

- **WHEN** 6 toasts are active simultaneously
- **THEN** only the 5 most recent are visible; the oldest has been dismissed

### Requirement: Auto-dismiss by severity level

Toasts SHALL auto-dismiss after a duration determined by their level, unless
manually closed first. Success and info SHALL dismiss after 3 seconds, warning
after 5 seconds, and error SHALL NOT auto-dismiss.

#### Scenario: Success toast auto-dismisses

- **WHEN** a success toast is shown and 3 seconds elapse without manual close
- **THEN** the toast animates out and is removed

#### Scenario: Error toast persists

- **WHEN** an error toast is shown
- **THEN** the toast remains visible until the user clicks its close button

#### Scenario: Manual close before timer

- **WHEN** a success toast is shown and the user clicks its close button before 3 seconds
- **THEN** the toast is immediately dismissed and the auto-dismiss timer is cancelled

### Requirement: Toast enter and exit animation

Each toast SHALL animate in from the right (slide + fade) using `AnimatePresence`
from `motion/react`. The animation SHALL use a `TOAST` preset from `src/motion.ts`
with duration ≤ 0.25 s and the existing custom `EASE` curve.

#### Scenario: Toast slides in from right

- **WHEN** a new toast appears
- **THEN** it animates from `x: 40, opacity: 0` to `x: 0, opacity: 1` over the
  configured duration

#### Scenario: Toast slides out to right

- **WHEN** a toast is dismissed (auto or manual)
- **THEN** it animates from `x: 0, opacity: 1` to `x: 40, opacity: 0` and is
  removed from the DOM after the animation completes

### Requirement: Toast renders at the designated z-index layer

The toast container SHALL render at `z-[var(--z-toast)]`, which resolves to `70`
per the DESIGN.md stacking scale. This places toasts above confirm dialogs (`60`)
and below tooltips (`80`).

#### Scenario: Toast above confirm dialog

- **WHEN** a toast fires while a confirm dialog is open
- **THEN** the toast renders above the confirm dialog's overlay

### Requirement: Manual close button

Each toast card SHALL display a small close (✕) button on the right side that
dismisses the toast on click and cancels its auto-dismiss timer.

#### Scenario: Click close on auto-dismiss toast

- **WHEN** the user clicks the close button on a success toast
- **THEN** the toast animates out immediately

#### Scenario: Click close on error toast

- **WHEN** the user clicks the close button on an error toast
- **THEN** the toast animates out immediately (only dismissal method for errors)
