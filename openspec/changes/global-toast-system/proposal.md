## Why

The application performs destructive and mutating actions (project/session deletion, rename, settings save, feedback submission) with zero visual feedback on success or failure. Users operate blind — they cannot tell whether an action succeeded until they manually check. The design system already reserves `--z-toast: 70` for transient notifications, but no component implements it.

## What Changes

- Add a global toast notification system rendered at `z-[var(--z-toast)]` in the top-right corner of the window.
- Provide an imperative `useToast()` hook (same pattern as existing `useConfirm()`) so any component can fire a toast without prop-drilling.
- Support four severity levels — `success`, `info`, `warning`, `error` — each with a distinct left-border color drawn from the existing semantic color tokens.
- Stack up to 5 concurrent toasts; oldest auto-dismisses when the cap is exceeded.
- Auto-dismiss timing: success/info 3 s, warning 5 s, error requires manual close.
- Animate enter/exit with `motion` (slide-in from right + fade), reusing the motion constants from `src/motion.ts`.
- Wire toast calls into existing action sites: project delete, session delete, session rename, settings save, feedback submission, and agent connection status changes.

## Capabilities

### New Capabilities

- `global-toast-system`: Imperative toast notification provider, `useToast()` hook, toast rendering container, and animation/stacking behaviour.

### Modified Capabilities

- `global-confirm-dialog`: After confirm resolves positively, callers can now optionally trigger a toast (e.g. delete confirmed → success toast). No spec-level change to the confirm dialog itself — the integration is purely at call sites.
- `session-management`: `deleteProject()` and `deleteSession()` now emit success/error toasts on completion.
- `visual-theme`: Toast component uses existing semantic color tokens (`success`, `warning`, `danger`, `accent-warm`) and `surface` background. No new tokens needed.

## Impact

- **Renderer only** — no Rust, no IPC, no sidecar changes.
- New files: `src/components/ToastProvider.tsx` (provider + hook + container).
- Modified files: `App.tsx` (mount provider), `TitleBar.tsx`, `SessionHeader.tsx`, `SettingsModal.tsx`, `MessageActionBar.tsx`, and `SessionProvider.tsx` (call `toast()` at action sites).
- Dependencies: `motion` (already in `package.json`), no new packages.
- DESIGN.md: unchanged — all visual tokens already exist.
