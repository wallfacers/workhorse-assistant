## 1. Phase 1 — Auto-scroll anti-jitter

- [x] 1.1 Rewrite `src/hooks/use-auto-scroll.ts` to the `useAutoScroll(deps, resetDeps)` signature returning `{ ref, scrollToBottom, isAtBottom }` (callback ref, not passed-in ref)
- [x] 1.2 Add frame-level mutation suppression: `suppressMutationsUntilNextFrame()` + the `suppressMutationScrolls` / `pendingFollowAfterSuppression` / `releaseMutationSuppressionFrame` refs, and make the `MutationObserver` callback a no-op (recording pending follow) while suppressed
- [x] 1.3 Add `scheduleFollow()` rAF de-dup (≤ one follow-scroll per frame) and a shared `handleContentGrowth` handler
- [x] 1.4 Add a `ResizeObserver` wired to `handleContentGrowth` for late layout changes (highlight finishing, images)
- [x] 1.5 Implement `handleScroll` with `lastScrollTop` tracking: `movedUp && distanceFromBottom > 0` → pause; strict bottom (≤ 2px) → re-engage
- [x] 1.6 Add wheel (`deltaY < 0`) and touch (touchstart/touchmove downward) upward-intent detection that pauses following
- [x] 1.7 Add the two `useLayoutEffect`s: `deps` → structural scroll + suppression; `resetDeps` → forced re-follow + scroll
- [x] 1.8 Update `AgentRail.tsx`: add a `userSendVersion` ref incremented in `handleSend`, pass `deps={[messages.length]}` and `resetDeps={[userSendVersion]}`, and attach the hook's callback ref to the scroll container
- [ ] 1.9 Verify in `npm run dev`: stream a long reply (stays pinned, no jump), scroll up mid-stream (pauses), send while scrolled up (snaps to bottom), scroll back to bottom (re-engages), scroll-to-bottom button toggles by opacity

## 2. Phase 2 — Code-block enrichment

- [x] 2.1 Add `shiki` (^4) to `package.json` and install
- [x] 2.2 Create `src/components/chat/highlighter.ts`: lazy memoized Shiki singleton (`github-light` + `github-dark`, the ~11 langs from design D2), exporting `highlightCode(lang, code)` with `themes:{light,dark}, defaultColor:false`
- [x] 2.3 Create `src/components/chat/CodeBlock.tsx`: props `language`, `code`, `streaming`; `highlighted: string | null` state; calls `highlightCode()` in an effect; skips highlight while `streaming` (renders plain text, sets `data-streaming-code="true"`)
- [x] 2.4 Add the language-label pill (human-friendly `LANGUAGE_LABELS` map) and the copy button (writes raw source, shows a confirmed state ~2s) using `data-component="markdown-code"` / `data-slot` naming
- [x] 2.5 Update `MarkdownContent.tsx`: `code` component renders `<CodeBlock>` when `className?.startsWith('language-')` (drop the `\n`-in-children heuristic); `pre` component becomes a thin pass-through; keep the lightweight inline-code pill
- [x] 2.6 Add code-block + Shiki dual-theme CSS to `src/index.css` **below** the generated `@theme` block, using `var(--color-*)` tokens (no hand-tuned hex); `pre.shiki` → `--shiki-light`, `.dark … pre.shiki` → `--shiki-dark`, token `background:transparent`
- [ ] 2.7 Verify in `npm run dev`: a fenced block highlights, copy works with confirm state, language pill is correct, and the block stays legible after toggling light/dark with no re-highlight flash

## 3. Phase 3 — Streaming stability

- [x] 3.1 Update `StreamingText` in `AgentRail.tsx` to bypass pacing when `streaming && /```|~~~/.test(target)` (set `shown = target` immediately, skip the timer)
- [ ] 3.2 Confirm a streaming code block renders as stable plain text mid-stream (no per-tick re-highlight) and highlights once on completion (interplay of 3.1 + 2.3)
- [ ] 3.3 Verify in `npm run dev`: stream a reply containing a multi-line code fence — no flicker while growing, correct highlight after `assistant_text_done`

## 4. Gate

- [x] 4.1 `npm run lint` (tsc --noEmit) passes
- [x] 4.2 `npm test` passes (no regression in existing suites)
- [x] 4.3 Update `docs/` if any token mapping or DESIGN.md note is needed (per docs-as-code); otherwise note none required
