## Context

Agent Chat streams assistant output token-by-token over Tauri events
(`agent://text/{sid}`). Each delta runs `setMessages` (rebuilding the last
message's `parts`), and `StreamingText` additionally paces characters with its own
`setShown`, so `MarkdownContent` re-parses the whole markdown tree every frame.
Code blocks render plain `<pre>` while streaming, then swap to Shiki HTML once
done — a height change that retriggers the auto-scroll observers. `index.css`
styles `pre.shiki` colour but never sets a colour on the token `span`s, so Shiki's
`--shiki-light/--shiki-dark` per-token variables are emitted but never consumed
(single-colour output). The code-block container uses `bg-surface-muted`, the same
family as the bubble, and Shiki's own background is forced `transparent`. The flex
chain lacks `min-width:0`, so long code stretches the bubble instead of scrolling.
The sidecar exposes `POST /v1/sessions/{id}/cancel` (`internal/api/sessions.go:169`,
202 Accepted) and accepts `{"type":"interrupt"}` on the stream, but no renderer or
Rust path reaches it.

## Goals / Non-Goals

**Goals:**
- Already-rendered content does not move while later content streams.
- Real syntax colouring + a visually distinct, theme-aware code-block background.
- Long code lines scroll horizontally within the block.
- Immediate avatar + blinking-star placeholder until the first token.
- A send→stop button that performs a real interrupt; streamed text is preserved.

**Non-Goals:**
- Changing the SSE wire protocol or sidecar behaviour (cancel already exists).
- Reworking reasoning rendering (owned by `wire-reasoning-stream`).
- Virtualised/windowed message lists (out of scope for this pass).

## Decisions

- **Replace react-markdown with a marked + morphdom streaming engine** (ported from
  data-talk; chosen over the lighter React.memo/block-split approach). react-markdown
  re-parses the full markdown and re-reconciles the whole tree on every delta, rebuilding
  code-block DOM each frame → jitter. The engine instead: splits off the trailing open
  code fence (`markdown-stream.ts`), hash-caches completed blocks (no re-parse), and
  patches the DOM with `morphdom` (minimal mutations — growing code is an append-only
  text diff, so already-rendered nodes never move). Completed code blocks are Shiki-
  highlighted asynchronously and patched in once, then cached. *Trade-off*: adds
  `marked`/`morphdom`/`dompurify` deps and reimplements markdown element styling in CSS
  (marked emits class-less HTML), but it is the proven jitter-free path.
- **Shiki JavaScript engine.** Use `shiki/engine/javascript` (not the default Oniguruma
  WASM engine), which fails to load in the Tauri webview and silently disabled all
  highlighting. The JS engine has no WASM dependency and colours reliably in the webview.
- **Stable code-block height across the highlight swap.** Keep the same padding,
  font-size and line-height for the streaming `<pre>` and the highlighted Shiki
  output (already mostly aligned in CSS) so the streaming→done swap does not change
  height and does not retrigger an auto-scroll jump. Bypass per-char pacing for
  fenced code (already done in `StreamingText`) so code appears whole, not growing.
- **Consume Shiki token variables.** Add `.shiki-wrapper pre.shiki span { color: var(--shiki-light) }`
  (and `.dark … { color: var(--shiki-dark) }`). This is the missing rule that turns
  on real colouring. *Alternative*: switch Shiki to inline `color` (`defaultColor` a
  single theme) — rejected; it breaks instant theme switching.
- **Distinct block background from DESIGN.md tokens.** Give the code-block container a
  dedicated background (light: a faint neutral like the design's code surface; dark: a
  deeper panel than the bubble) via existing tokens, not Shiki's own bg, so it stays on
  the design system. The top bar stays one step elevated for separation.
- **Horizontal scroll.** Add `min-w-0` to the flex item wrapping the message content and
  ensure `pre.shiki`/streaming `<pre>` keep `white-space: pre` with the wrapper owning
  `overflow-x: auto` (`custom-scrollbar`). This makes long lines scroll, not wrap/stretch.
- **First-token placeholder.** On send, immediately append an assistant message whose
  single part is a `pending` placeholder (avatar shown by the existing row). Render a
  blinking `Sparkles` (lucide) icon that colour-cycles and settles on the project theme
  colour via a CSS keyframe. The first `agent://text` delta replaces the placeholder
  part with the streaming text part (reuse the same message id so no row remount).
  *Alternative*: a separate transient "typing" row — rejected; reusing the message id
  avoids a layout jump when text arrives.
- **Stop control = real cancel.** Add Rust command `agent_cancel(session_id)` →
  `POST /v1/sessions/{id}/cancel`; expose `cancelAgentMessage()` in `ipc/agent.ts`. The
  composer button is Send when idle and Stop (square icon) while any message id is in
  `streamingIds`; Stop calls cancel, then locally finalises (clear `streamingIds`,
  flush `assistantIdRef`/`deltaRef`). Streamed text already in `messages` is kept.

## Risks / Trade-offs

- [Cancel races a near-complete stream] → The 202 is best-effort; the renderer finalises
  its own state regardless, so the UI is consistent even if `textdone` and `cancel` cross.
- [Placeholder lingers if the run errors before any token] → the existing
  `agent://error` and `textdone` handlers must also clear a pending placeholder, not only
  a streaming text part. Covered by a spec scenario.
- [Distinct bg vs DESIGN.md fidelity] → use only existing tokens; if none fits, add one
  token to DESIGN.md and re-export rather than hand-tuning a hex in the component
  (per CLAUDE.md: no hand-tuned visual values).
- [`React.memo` staleness] → memo compares `content`+`streaming`; the streaming bubble
  still updates every delta (its content changes), only static siblings are skipped.

## Open Questions

- None blocking. Exact background token values resolved against DESIGN.md during apply.
