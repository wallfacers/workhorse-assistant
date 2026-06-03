## 1. Shared motion preset

- [x] 1.1 Create `src/motion.ts` exporting `PANEL`, `TAB`, `FADE`, `SPLIT` preset objects (duration, ease, enter/exit keyframes) as defined in design D2
- [x] 1.2 Verify `import { AnimatePresence, motion } from 'motion/react'` resolves correctly at build time (the package is already installed; confirm tree-shaking works with the Vite setup)

## 2. Right panel (工作台) open/close animation

- [x] 2.1 In `App.tsx`, replace the ternary (`rightPanelOpen ? <RightPanel/> : <button/>`) with: (a) an `AnimatePresence`-wrapped `motion.div` for the panel that animates `width: 0 → auto` + `opacity: 0 → 1` on enter and the reverse on exit; (b) an always-mounted `motion.div` for the open button that fades opacity based on `rightPanelOpen`
- [x] 2.2 Add `overflow: hidden` to the panel wrapper and `flex-shrink-0` so the flex layout is correct during animation
- [x] 2.3 Use the `PANEL` preset (300ms, Material ease-out) for the panel transition and `FADE` (150ms) for the button fade
- [x] 2.4 Verify the `flex-1` Group resizes smoothly in sync with the panel width animation (no jump or lag)

## 3. Tab bar enter/exit animation

- [x] 3.1 In `TabBar.tsx`, wrap each tab item in `motion.div` with `layout` prop, `initial={TAB.enter}`, `animate={{ opacity: 1, scale: 1 }}`, `exit={TAB.exit}`, and `transition={{ duration: TAB.duration, ease: TAB.ease }}`
- [x] 3.2 Wrap the tabs list in `AnimatePresence`
- [x] 3.3 Ensure the trailing `+` button (`ProfileMenu`) does not get a `layout` animation (it should stay anchored)
- [x] 3.4 Verify: adding a tab shows the new item scaling in while existing tabs smoothly shift right; closing a tab shows it scaling out while remaining tabs smoothly shift left

## 4. Tab content cross-fade

- [x] 4.1 In `TerminalWorkspace.tsx`, replace the `hidden` class logic (line 112-114) with `motion.div` wrapping each group. Animate `opacity: active ? 1 : 0` and set `pointerEvents: active ? 'auto' : 'none'`
- [x] 4.2 Use `initial={false}` so the first render doesn't animate in from opacity 0
- [x] 4.3 Use the `FADE` preset (200ms, easeOut) for the cross-fade
- [x] 4.4 Verify: switching tabs shows a smooth cross-fade; all PTY sessions remain alive (no remount); inactive groups are non-interactive
- [x] 4.5 Check performance: with 3+ tabs open, confirm xterm canvases in hidden groups don't cause noticeable CPU/GPU overhead

## 5. Split pane enter animation

- [x] 5.1 In `TerminalGroup.tsx`, wrap each PaneCard's position div (the one with `style={style}` at line 195) in `motion.div` with `initial={SPLIT.enter}`, `animate={{ opacity: 1, scale: 1 }}`, `transition={{ duration: SPLIT.duration, ease: SPLIT.ease }}`
- [x] 5.2 Use the `SPLIT` preset (250ms, Material ease-out, scale 0.96)
- [x] 5.3 Verify: splitting a pane shows the new PaneCard fading+scaling in; the existing pane repositions instantly (following the geometry layer); the animation is purely visual on the terminal layer
- [x] 5.4 Ensure `ResizeObserver` → `measure()` → `setRects()` still syncs correctly during and after the animation (the geometry layer is instant; the terminal layer animates into the measured positions)

## 6. Split pane exit animation (deferred close)

- [x] 6.1 In `TerminalGroup.tsx`, add local state `closingPaneId: string | null` (default `null`)
- [x] 6.2 When `onClosePane(paneId)` is called, set `closingPaneId = paneId` instead of immediately calling the prop
- [x] 6.3 The closing PaneCard gets `exit={SPLIT.exit}` and is wrapped in `AnimatePresence`; on `onAnimationComplete`, call the original `onClosePane` prop and clear `closingPaneId`
- [x] 6.4 During the exit animation, the closing PaneCard should have reduced interactivity (optional: dim opacity or a subtle overlay)
- [x] 6.5 Edge case: if the user triggers another split/close while a close animation is in progress, the stale `closingPaneId` should be handled gracefully (the reducer is the source of truth)
- [x] 6.6 Verify: closing a split pane shows the PaneCard fading+scaling out, then the surviving pane smoothly expands to fill the space

## 7. Verification

- [x] 7.1 `npm run lint` passes (type-check gate)
- [ ] 7.2 `npm run dev` — manual check all four animations: right panel, tab add/close, tab switch, split/open close *(requires manual verification)*
- [ ] 7.3 Performance: no visible frame drops or jank during any animation (test on both light and dark themes) *(requires manual verification)*
- [ ] 7.4 PTY survival: after tab switch animation and split/close animation, all terminal sessions are still alive and responsive *(requires manual verification)*
- [ ] 7.5 Responsive: verify animations work correctly at different window widths (the right panel's target width varies by breakpoint) *(requires manual verification)*
