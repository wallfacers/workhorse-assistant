## Why

`add-agent-chat` wired the AgentRail into a live session — assistant text streams,
tool calls render — but it shipped the rendering layer in a deliberately minimal
form. Three rough edges now hurt every conversation:

1. **Auto-scroll jitter** — `use-auto-scroll.ts` scrolls on *both* the
   `useLayoutEffect` (React deps) and the `MutationObserver` callback within the
   same DOM append, so each new chunk fires two scrolls one frame apart →
   visible jump. There is no frame-level suppression, no `ResizeObserver`, and no
   touch handling, so it never reaches the smoothness of the data-talk reference.
2. **Bare code blocks** — fenced code renders as a plain dark `<pre>` with no
   syntax highlighting, no copy button, no language label, and a hardcoded dark
   background that ignores light mode.
3. **Streaming code re-render** — `StreamingText` feeds *every* character through
   the paced reveal, including code-fence bodies, so a highlighted block would be
   re-tokenized on every tick. data-talk's `PacedMarkdown` bypasses pacing the
   moment it sees a code fence; we don't, which is the root cause of code-block
   flicker during streaming.

These are pure renderer-quality gaps. Fixing them needs no backend or protocol
change and can be verified entirely in the browser (`npm run dev`).

## What Changes

- **Rewrite the auto-scroll anti-jitter mechanism**: port data-talk's frame-level
  mutation suppression (`suppressMutationsUntilNextFrame`), `requestAnimationFrame`
  follow de-duplication (`scheduleFollow`), a `ResizeObserver` sharing the same
  growth handler, strict-bottom (2px) re-engage detection, wheel + touch
  upward-intent detection, and a `(deps, resetDeps)` hook signature driving two
  `useLayoutEffect`s (structural scroll on new content; forced override on user
  send). `AgentRail` adds a `userSendVersion` ref fed to `resetDeps`.
- **Add code-block enrichment**: a lazy Shiki singleton highlighter
  (`github-light` + `github-dark`, `defaultColor:false` → CSS-variable output) and
  a `CodeBlock` component with a language label pill, a copy button (with a 2s
  confirmation state), and dual-theme styling that follows the app's `.dark`
  class. Highlighting is skipped while a block is still streaming.
- **Bypass pacing for code fences**: `StreamingText` reveals fenced code
  instantly (data-talk parity) instead of character-by-character, eliminating the
  re-tokenize-per-tick flicker.
- **New dependency**: `shiki` (^4). Ships a WASM grammar engine + bundled themes;
  loaded lazily so it stays off the initial render path.

## Capabilities

### New Capabilities
- `chat-autoscroll`: the AgentRail message list's follow-the-bottom behaviour —
  jitter-free auto-follow on new content, pause-on-manual-scroll-up (wheel +
  touch), re-engage at strict bottom, and forced re-follow when the user sends.
- `chat-code-rendering`: how fenced code and streaming Markdown render in chat —
  syntax highlighting, copy affordance, language label, light/dark theming, and
  the streaming code-fence bypass that keeps highlighted blocks stable.

### Modified Capabilities
<!-- None. `agent-chat` (streaming/tool-call wiring) remains in the change phase
     and is not a published spec; this change introduces the rendering-quality
     capabilities alongside it rather than amending an unpublished spec. -->

## Impact

- **Code**: `src/hooks/use-auto-scroll.ts` (rewrite), `src/components/AgentRail.tsx`
  (hook call + `userSendVersion`), `src/components/chat/MarkdownContent.tsx`
  (code/pre components), new `src/components/chat/CodeBlock.tsx` and
  `src/components/chat/highlighter.ts`, `src/index.css` (code-block + Shiki
  dual-theme styles, outside the generated `@theme` block).
- **Dependencies**: adds `shiki` (^4) to `package.json`.
- **Design tokens**: code-block colours must use existing `var(--color-*)` tokens
  (`--color-outline`, `--color-surface`, `--color-surface-muted`, etc.) per
  `docs/DESIGN.md` — no hand-tuned hex in component or CSS.
- **No backend / protocol / Rust changes.** Renderer-only; verifiable in
  `npm run dev`.
- **Risk**: low. Bundle-size from Shiki's WASM is the main consideration,
  mitigated by lazy singleton loading.
