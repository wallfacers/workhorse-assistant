## Context

`add-agent-chat` delivered the live chat wiring but a minimal renderer. The three
rough edges (scroll jitter, bare code blocks, streaming code flicker) all have a
known-good reference in `data-talk` (`client/src/hooks/use-auto-scroll.ts` and
`client/src/features/chat/components/markdown/`). This change ports those
mechanisms onto Workhorse's design tokens. It is renderer-only — no Rust,
protocol, or backend involvement — and is verified in `npm run dev`.

Constraints:
- Per `CLAUDE.md` / `docs/DESIGN.md`: no hand-tuned visual values. Colours come
  from the generated `@theme` tokens in `src/index.css`; new CSS lives **outside**
  the regenerated `@theme` block (alongside the existing `.custom-scrollbar` /
  `.overflow-anchor-auto` rules).
- `tsc --noEmit` (`npm run lint`) is the commit gate.

## Goals / Non-Goals

**Goals:**
- Smooth, jitter-free auto-follow matching data-talk's feel.
- Code blocks with syntax highlighting, a language label, a copy button, and
  correct light/dark theming.
- Stable streaming: code fences do not re-tokenize per tick.

**Non-Goals:**
- Any `reasoning`/thinking rendering — that is `wire-reasoning-stream` (Change B).
- Any backend, Rust bridge, or protocol change.
- Mermaid/diagram rendering, math, or other Markdown extensions beyond GFM.
- Persisting per-user scroll/highlight preferences.

## Decisions

### D1: Rewrite `use-auto-scroll.ts` with a `(deps, resetDeps)` signature

Adopt data-talk's hook shape: `useAutoScroll(deps, resetDeps)` returning
`{ ref, scrollToBottom, isAtBottom }` (a callback `ref`, not a passed-in ref).
Two `useLayoutEffect`s drive it: `deps` (e.g. `[messages.length]`) does the
structural scroll + mutation suppression; `resetDeps` (e.g. `[userSendVersion]`)
forces follow back on for user sends.

The anti-jitter core is **frame-level mutation suppression**:
`suppressMutationsUntilNextFrame()` sets a flag that turns the `MutationObserver`
callback into a no-op for the current frame (recording a pending-follow instead),
then a `requestAnimationFrame` clears the flag and performs the deferred scroll.
This is what collapses the layout-effect scroll and the observer scroll into one.
A `scheduleFollow()` rAF guard ensures at most one follow-scroll per frame.

A `ResizeObserver` shares the same `handleContentGrowth` handler so late layout
changes (code highlight finishing, images) also re-pin while following.

`handleScroll` tracks `lastScrollTop`; `movedUp && distanceFromBottom > 0` →
pause; `distanceFromBottom ≤ 2px` (strict) → re-engage. Wheel (`deltaY < 0`) and
touch (finger moving down) set the paused state directly.

**Why over the current approach:** today's hook scrolls on both the deps effect
and the MO callback with no suppression, which is the literal cause of the double
scroll. Keeping the current shape and "just adding a guard" can't coalesce the
two code paths cleanly — the suppression handshake is the mechanism that does.

**Alternative considered:** CSS `overflow-anchor` alone. It helps for
content-above changes but does not pin to bottom on growth, so it's necessary but
not sufficient; we keep `overflow-anchor: auto` and add the JS follow on top.

### D2: Shiki singleton with `defaultColor:false` + CSS variables

A `highlighter.ts` module lazily creates one Shiki highlighter
(`createHighlighter({ themes:['github-light','github-dark'], langs:[...] })`)
behind a memoized promise, exporting `highlightCode(lang, code): Promise<string>`
called with `themes:{light,dark}, defaultColor:false`. Shiki then emits
`--shiki-light` / `--shiki-dark` CSS variables per token; `src/index.css` selects
between them by the ancestor `.dark` class. This gives theme switching with **zero
JS re-highlight**.

Languages bundled: `javascript, typescript, python, rust, bash, json, html, css,
sql, yaml, markdown` (extendable). Lazy loading keeps the WASM engine off the
initial render path.

**Alternative considered:** `react-syntax-highlighter` / Prism. Heavier React
re-render per block, weaker theming story, and no first-class dual-theme CSS-var
output. Shiki's `defaultColor:false` is purpose-built for exactly this.

### D3: `CodeBlock.tsx` owns the block chrome; `MarkdownContent` delegates

`MarkdownContent`'s `code` component renders `<CodeBlock language code streaming>`
when `className` starts with `language-`; its `pre` component becomes a thin
pass-through (CodeBlock renders its own `<pre>`). Block detection relies solely on
`className?.startsWith('language-')` — dropping the unreliable `\n`-in-children
heuristic. `CodeBlock` holds `highlighted: string | null` state, calls
`highlightCode()` in an effect, renders the language pill + copy button, and skips
highlighting while `streaming` (sets `data-streaming-code="true"`, renders plain
text). data- attribute names mirror data-talk
(`data-component="markdown-code"`, `data-slot="markdown-code-bar|language|actions"`).

### D4: `StreamingText` bypasses pacing on code fences

`StreamingText` (in `AgentRail.tsx`) gains data-talk's `PacedMarkdown` rule: if
`streaming && /```|~~~/.test(target)`, set `shown = target` immediately and skip
the timer. This prevents the paced reveal from feeding a code body
character-by-character (each tick currently remounts a growing block). Combined
with D3's "no highlight while streaming," code stays plain+stable mid-stream and
highlights once on completion.

### D5: CSS placement and tokens

New rules go in `src/index.css` **below** the generated `@theme` block (where
`.custom-scrollbar` already lives). Map data-talk tokens → Workhorse:
`--border → --color-outline`, `--background → --color-surface`,
`--muted → --color-surface-muted`, dark variants → `--color-*-dark`. Shiki dual
theme: `[data-component="markdown-code"] pre.shiki { color: var(--shiki-light) }`
and `.dark … { color: var(--shiki-dark) }`, tokens `background:transparent`.

## Risks / Trade-offs

- **[Shiki WASM bundle size inflates the build]** → Lazy singleton: the engine
  loads only when the first code block renders, off the initial path. Bundle only
  the ~11 languages actually used.
- **[First code block shows unhighlighted for a beat while WASM loads]** →
  Acceptable: it renders as readable plain `pre` first, then upgrades. Matches
  data-talk behaviour.
- **[Auto-scroll rewrite regresses an edge case (e.g. resize loops)]** → The
  `ResizeObserver` + rAF guard de-dupes; verify the classic cases manually in
  `npm run dev`: stream long reply, scroll up mid-stream, send while scrolled up,
  toggle theme over a code block, load a reply with a tall code block.
- **[`defaultColor:false` markup differs from a normal Shiki block]** → CSS must
  target `pre.shiki` and set token `background:transparent` to avoid double
  backgrounds; covered in D5.

## Migration Plan

Renderer-only; no data or protocol migration. Rollback is reverting the changed
files and removing the `shiki` dependency. Land incrementally by phase
(autoscroll → code block → streaming bypass); each phase is independently
verifiable in `npm run dev` and gated by `npm run lint`.

## Open Questions

- Exact final language set for Shiki — start with the 11 above; add on demand.
- Whether to expose a "wrap long lines" toggle on code blocks — deferred; not in
  this change's scope.
