## 1. Toast Infrastructure

- [x] 1.1 Add `TOAST` motion preset to `src/motion.ts` (duration 0.22, EASE curve, enter/exit with x: 40 + opacity: 0)
- [x] 1.2 Create `src/components/ToastProvider.tsx` — context, `useToast()` hook, toast state queue (max 5), auto-dismiss timers, and unique ID generation
- [x] 1.3 Implement `ToastItem` component — surface bg, 3px left semantic-color border, level icon (✓/ℹ/⚠/✕), message text in `body-sm`, close button
- [x] 1.4 Implement `ToastContainer` — fixed top-right, `z-[var(--z-toast)]`, `AnimatePresence` + `motion.div` with TOAST preset, vertical stacking with gap
- [x] 1.5 Mount `ToastProvider` in `App.tsx` above `ConfirmProvider` in the provider tree

## 2. Wire Toasts into Action Sites

- [x] 2.1 `TitleBar.tsx` — project delete: add success toast `项目 "{name}" 已删除` on confirm + delete success; add error toast on failure
- [x] 2.2 `SessionHeader.tsx` — session delete: add success toast `会话已删除` on confirm + delete success; add error toast on failure
- [x] 2.3 `SessionHeader.tsx` — session rename: add success toast `已重命名` on successful rename
- [x] 2.4 `SettingsModal.tsx` session management tab — single session delete: add success/error toasts
- [x] 2.5 `SettingsModal.tsx` session management tab — batch session delete: add success toast `已删除 N 个会话`, partial-failure warning toast `已删除 M/N 个会话`
- [x] 2.6 `SettingsModal.tsx` session management tab — inline rename: add success toast `已重命名`
- [x] 2.7 `SettingsModal.tsx` — settings save: add success toast `设置已保存` after successful save
- [x] 2.8 `MessageActionBar.tsx` — feedback submit: add success toast `感谢反馈` after `submitFeedback()`

## 3. Polish and Verify

- [ ] 3.1 Verify dark mode: toast cards use CSS variable tokens and render correctly in both light and dark themes
- [ ] 3.2 Verify stacking: fire 6 toasts rapidly and confirm the oldest is auto-dismissed
- [ ] 3.3 Verify z-order: fire a toast while a confirm dialog is open — toast renders above the dialog
- [ ] 3.4 Verify animation: toast slides in from right, slides out on dismiss, `AnimatePresence` handles exit properly
- [x] 3.5 Run `npm run lint` — type-check passes with no errors
