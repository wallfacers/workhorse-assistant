## Why

The Agent Chat stream surface (shipped by `agent-chat-polish` / `wire-reasoning-stream`)
has five rough edges that hurt readability and control during live streaming:
message bubbles and code blocks jitter as tokens arrive, code blocks render in a
single colour against a same-coloured background with no horizontal scroll, there
is a blank gap before the first token, and there is no way to stop a run in
flight. The sidecar already exposes `POST /v1/sessions/{id}/cancel`, so real
interruption is one bridge command away.

## What Changes

- **Stream stability**: stop the per-frame re-parse/re-scroll churn so already-rendered
  bubbles and code blocks stay still while new tokens stream in (memoised markdown,
  stable code-block height across the streaming→highlighted swap, coalesced auto-scroll).
- **Code block legibility**: consume Shiki's per-token `--shiki-light/--shiki-dark`
  colour variables (real syntax colouring) and give the block a background distinct
  from the message bubble, in both light and dark themes, sourced from DESIGN.md tokens.
- **Code block horizontal scroll**: long lines scroll horizontally inside the block
  instead of stretching the bubble (fix the missing `min-width:0` on the flex chain).
- **First-token placeholder**: show the assistant avatar immediately on send, with a
  Claude-Code-CLI-style blinking star icon (colour-cycling, settling on the project
  theme colour) until the first token arrives, then swap to the streamed text.
- **Stop control**: while the assistant is streaming, the send button becomes a stop
  button that performs a real interrupt via a new `agent_cancel` Rust command →
  `POST /v1/sessions/{id}/cancel`; already-streamed text is preserved.

## Capabilities

### New Capabilities
- `agent-chat-stop`: a user-driven stop control over the live agent stream, backed by
  a renderer→Rust→sidecar cancel command and the send/stop button state machine.
- `agent-chat-stream-ux`: streaming readability requirements — stable (non-jittering)
  bubbles/code-blocks during streaming, Shiki per-token syntax colouring, a block
  background distinct from the bubble in both themes, horizontal scroll for long lines,
  and a first-token avatar+blinking-star placeholder.

### Modified Capabilities
<!-- None: chat-autoscroll's base spec is still in the in-progress agent-chat-polish
     change and not yet archived in openspec/specs/, so the anti-jitter tightening is
     captured as a requirement under the new agent-chat-stream-ux capability instead. -->


## Impact

- Front-end: `src/components/AgentRail.tsx` (first-token placeholder, send/stop button,
  cancel wiring, message render keys), `src/components/chat/CodeBlock.tsx`,
  `src/components/chat/MarkdownContent.tsx` (memoisation), `src/components/chat/highlighter.ts`,
  `src/index.css` (Shiki token colours, block background, horizontal scroll),
  `src/hooks/use-auto-scroll.ts` (swap-time coalescing if needed).
- IPC/Rust: `src/ipc/agent.ts` (`cancelAgentMessage`), `src-tauri/src/agent/mod.rs`
  (`agent_cancel` command → `POST /v1/sessions/{id}/cancel`), command registration in `lib.rs`.
- Sidecar: no change — `POST /v1/sessions/{id}/cancel` already exists (`internal/api/sessions.go:169`).
- No new network calls from the renderer (cancel routes through Rust, per AGENTS.md).
