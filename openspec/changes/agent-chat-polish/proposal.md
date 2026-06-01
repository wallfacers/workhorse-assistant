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
  growth handler, near-bottom (60px) re-engage detection, wheel + touch
  upward-intent detection, and a `(deps, resetDeps)` hook signature driving two
  `useLayoutEffect`s (structural scroll on new content; forced override on user
  send). `AgentRail` adds a `userSendVersion` ref fed to `resetDeps`.
- **Replace the Markdown rendering engine**: `MarkdownContent` parses with
  `marked`, sanitises the HTML with `DOMPurify`, and patches the DOM with
  `morphdom` (instead of re-reconciling via `react-markdown`, which re-parses the
  full string on every streaming tick). A new `src/components/chat/markdown-stream.ts`
  splits the in-flight Markdown into stable prose blocks and an in-progress code
  fence so only the tail re-renders.
- **Add code-block enrichment**: a lazy Shiki singleton highlighter
  (`github-light` + `github-dark`, `defaultColor:false` → CSS-variable output)
  using Shiki's **JavaScript RegExp engine** (`shiki/engine/javascript`), bundling
  27 languages. The code chrome (language label pill + copy button with a 2s
  confirmation state) is built imperatively by `decorateCodeBlocks` over the parsed
  `<pre>` elements, with a document-level delegated copy listener — there is no
  React `CodeBlock` component. Highlighting is skipped while a block is still
  streaming. Dual-theme styling follows the app's `.dark` class.
- **Bypass pacing for code fences**: `StreamingText` reveals a message instantly
  when its tail starts a code fence (`/^(`{3,}|~{3,})/m`) instead of
  character-by-character, eliminating the re-tokenize-per-tick flicker.
- **New dependencies**: `shiki` (^4), `marked` (^18), `morphdom` (^2),
  `dompurify` (^3). The Shiki highlighter loads lazily and uses the JS RegExp
  engine (not the WASM/Oniguruma engine — the WASM engine is disabled by the Tauri
  webview CSP), so no WASM is shipped on the render path.

## Capabilities

### New Capabilities
- `chat-autoscroll`: the AgentRail message list's follow-the-bottom behaviour —
  jitter-free auto-follow on new content, pause-on-manual-scroll-up (wheel +
  touch), re-engage near the bottom (60px), and forced re-follow when the user sends.
- `chat-code-rendering`: how fenced code and streaming Markdown render in chat —
  syntax highlighting, copy affordance, language label, light/dark theming, and
  the streaming code-fence bypass that keeps highlighted blocks stable.

### Modified Capabilities
<!-- None. `agent-chat` (streaming/tool-call wiring) remains in the change phase
     and is not a published spec; this change introduces the rendering-quality
     capabilities alongside it rather than amending an unpublished spec. -->

## Impact

- **Code**: `src/hooks/use-auto-scroll.ts` (rewrite), `src/components/AgentRail.tsx`
  (hook call + `userSendVersion` + code-fence pacing bypass),
  `src/components/chat/MarkdownContent.tsx` (rewritten as a marked + DOMPurify +
  morphdom renderer with imperative `decorateCodeBlocks`), new
  `src/components/chat/highlighter.ts` and `src/components/chat/markdown-stream.ts`,
  `src/index.css` (code-block + Shiki dual-theme styles, outside the `@theme` block).
- **Dependencies**: adds `shiki` (^4), `marked` (^18), `morphdom` (^2),
  `dompurify` (^3) to `package.json`. (`react-markdown` is no longer used by this
  renderer; it was introduced by `add-agent-chat` and any removal belongs there.)
- **Design tokens**: code-block colours must use existing `var(--color-*)` tokens
  (`--color-outline`, `--color-surface`, `--color-on-surface-muted`, etc.) per
  `docs/DESIGN.md` — no hand-tuned hex in component or CSS. Muted foreground roles
  use the `on-surface-muted` / `on-surface-dark-muted` tokens added to `docs/DESIGN.md`.
- **No backend / protocol / Rust changes.** Renderer-only; verifiable in
  `npm run dev`.
- **Risk**: low. Shiki bundles 27 grammars; bundle size is mitigated by lazy
  singleton loading and the lightweight JS RegExp engine (no WASM on the path).
