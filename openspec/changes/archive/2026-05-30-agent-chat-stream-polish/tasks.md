## 1. Code block legibility (problem 2) — CSS only

- [x] 1.1 In `src/index.css`, add `.shiki-wrapper pre.shiki span { color: var(--shiki-light); }` and `.dark .shiki-wrapper pre.shiki span { color: var(--shiki-dark); }` so Shiki per-token colours are consumed (keep the existing `background: transparent !important` on spans)
- [x] 1.2 Give `[data-component="markdown-code"]` a background distinct from the message bubble in both themes, using DESIGN.md tokens only (no hand-tuned hex); keep the top bar one step elevated. If no existing token fits, add one to `docs/DESIGN.md` and re-export per CLAUDE.md
- [x] 1.3 Switch Shiki to the **JavaScript RegExp engine** (`shiki/engine/javascript`) instead of the default Oniguruma WASM engine — the WASM engine fails to load in the Tauri webview, silently disabling all highlighting. Expand `LANGUAGES` to cover java/c/cpp/csharp/go/kotlin/php/ruby/swift/xml/scss/toml/dockerfile/diff/… and add aliases; unknown langs fall back to `text` (no throw)
- [x] 1.4 Verify in light + dark: java/python/html/go etc. render with IDEA-style multi-colour tokens and the block is visibly separated from the bubble _(runtime)_

## 2. Code block horizontal scroll (problem 3)

- [x] 2.1 Add `min-w-0` to the flex item wrapping assistant message content in `AgentRail.tsx` so a wide code block can shrink instead of stretching the bubble
- [x] 2.2 Ensure `pre.shiki` and the streaming `pre[data-streaming-code]` keep `white-space: pre` with the `.shiki-wrapper` / streaming `<pre>` owning `overflow-x: auto` (`custom-scrollbar`); confirm a long line scrolls horizontally and the bubble width is unchanged

## 3. Stream stability / anti-jitter (problem 1) — marked + morphdom engine

Root cause: react-markdown re-parses the full markdown and re-reconciles the whole
tree on every delta, rebuilding code-block DOM each frame. Replaced with data-talk's
streaming engine (chosen approach: full port).

- [x] 3.1 Add deps `marked`, `morphdom`, `dompurify`
- [x] 3.2 Port the streaming block splitter to `src/components/chat/markdown-stream.ts` (`stream(text, live)` isolates the trailing open code fence into a `stream-code` block; `stripPartialClosingFence` keeps the line count stable)
- [x] 3.3 Rewrite `MarkdownContent.tsx` as an imperative marked+morphdom renderer: per-block hash cache (completed blocks never re-parsed), `morphdom` minimal DOM patch (already-rendered nodes stay put), stable `stream-code` `<pre>` (append-only text diff), async Shiki highlight for completed blocks patched in once and cached, copy button via delegation, DOMPurify sanitize
- [x] 3.4 Add `[data-component="markdown"]` element styling to `index.css` (p/a/h/ul/ol/li/inline-code/blockquote/hr/table) to replace the former react-markdown component classes; match streaming `<pre>` metrics to `pre.shiki` so the highlight swap keeps constant height

## 4. First-token placeholder (problem 4)

- [x] 4.1 Extend `MessagePart` with a `pending` variant; on send, append an assistant message whose only part is `pending` (reuse a stable id stored in `assistantIdRef`)
- [x] 4.2 Create the placeholder UI: a blinking lucide `Sparkles` icon that colour-cycles and settles on the project theme colour, driven by a CSS keyframe added to `index.css` (theme-token colours, Claude-Code-CLI style)
- [x] 4.3 In the `agent://text` listener, replace the `pending` part with the streaming text part on the same message id (no row remount); render the placeholder before text/tool parts in the message branch
- [x] 4.4 Clear the placeholder on `agent://textdone` and `agent://error` if no token arrived (no dangling blinking indicator)

## 5. Stop control + real cancel (problem 5)

- [x] 5.1 Add Rust command `agent_cancel(session_id)` in `src-tauri/src/agent/mod.rs` issuing `POST /v1/sessions/{id}/cancel` (202 expected; map non-2xx to an `AgentError`); register it in the invoke handler (`lib.rs`)
- [x] 5.2 Add `cancelAgentMessage()` to `src/ipc/agent.ts` invoking `agent_cancel` for the active session (no direct sidecar call from the renderer)
- [x] 5.3 In `AgentRail.tsx`, make the composer button a Stop button (square icon) whenever `streamingIds` is non-empty, else Send; Stop calls `cancelAgentMessage()` then locally finalises (clear `streamingIds`, reset `assistantIdRef`/`deltaRef`), preserving streamed text
- [x] 5.4 Verify race-safety: stopping when `textdone`/cancel-ack cross leaves a single consistent idle state with no dangling streaming markers

## 6. Verify & gate

- [x] 6.1 `npm run lint` (tsc --noEmit) passes; `cargo check` for `src-tauri` passes
- [x] 6.2 _(runtime — needs sidecar)_ End-to-end against the running sidecar: send a prompt → avatar+star placeholder → text streams without jitter → code block is coloured/separated/scrollable → Stop interrupts and preserves partial text — verified live (a "write java quick sort" round-trip exercised the full stream→markdown→Shiki→stop path)
- [x] 6.3 `openspec validate agent-chat-stream-polish` passes
