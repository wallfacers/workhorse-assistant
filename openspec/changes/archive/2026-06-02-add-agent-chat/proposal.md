## Why

`agent-ui-control` gave the renderer a control surface (the agent can call UI
tools) and a Rust-proxied transport, but it carried only the *tool* direction:
`tool_use` down, `tool_result` up. There was no way for the **user to talk to the
agent** from the AgentRail, nor for the agent's **assistant text and its own
tool-call activity** to stream back into the chat. The AgentRail still rendered a
mock conversation (`agent-rail-chat`, archived) disconnected from any real
session.

This change wires the AgentRail into a live session: the user sends messages, the
assistant's text streams in token-by-token, and the agent's tool calls render as
inline status blocks.

> Note: this change documents behaviour that was implemented in the same working
> branch as `agent-ui-control` / `add-auto-connect`; the spec here is a faithful
> contract for the code already in `src/` and `src-tauri/`, kept as the system of
> record per `docs-as-code`.

## What Changes

- **User message uplink**: a new `agent_send_message` Tauri command POSTs a
  `{type:"user_message", content}` envelope to the session's `/stream` endpoint;
  the renderer calls it via `sendAgentMessage(content)`. Sending is gated on a
  `connected` session.
- **Assistant text streaming**: the Rust SSE reader relays the sidecar's
  `assistant_text_delta` and `assistant_text_done` server events as the Tauri
  events `agent://text/{sessionId}` and `agent://textdone/{sessionId}`. The
  AgentRail accumulates deltas into one assistant message and reveals them with a
  paced typewriter effect, rendering Markdown.
- **Tool-call visualization**: the reader relays `tool_call_start` and
  `tool_call_done` as `agent://toolstart/{sessionId}` / `agent://tooldone/{id}`;
  the AgentRail renders each as an inline `ToolCallBlock` that flips from
  `running` to `done`. (V1 protocol: `tool_call_done` carries only the id — no
  output payload.)
- **Real chat UI**: AgentRail replaces the mock conversation with a live message
  list (user bubbles + assistant Markdown), a streaming-text component, a
  tool-call block component, and an auto-scroll hook that follows new output but
  yields to manual scroll-up.

## Capabilities

### New Capabilities
- `agent-chat`: user→agent message uplink and agent→user streaming of assistant
  text and tool-call activity over the Rust-proxied bridge, plus the AgentRail
  live conversation UI.

### Modified Capabilities
<!-- None deployed yet. agent-chat builds on the agent-bridge-transport capability
     introduced by the in-flight `agent-ui-control` change; it adds new SSE event
     relays alongside the existing tool_use/tool_result ones rather than changing
     them. -->

## Impact

- **Renderer (`src/`)**: `src/ipc/agent.ts` gains `sendAgentMessage`; `AgentRail`
  gains the live conversation (replacing the mock); new
  `src/components/chat/MarkdownContent.tsx`, `src/components/chat/ToolCallBlock.tsx`,
  and `src/hooks/use-auto-scroll.ts`.
- **Tauri (`src-tauri/src/`)**: `agent::send_message` + the `agent_send_message`
  command (registered in `lib.rs`); `relay_event` gains four event arms
  (`assistant_text_delta/done`, `tool_call_start/done`). Custom commands need no
  `capabilities/default.json` entry (as with PTY/agent commands).
- **workhorse-agent (Go repo)**: relies on the sidecar already emitting
  `assistant_text_delta/done` and `tool_call_start/done` server events and
  accepting `{type:"user_message"}` on the session stream — no Go change owned by
  this change.
- **Out of scope**: tool-output payloads in `tool_call_done`, message history
  persistence, multi-session chat, attachments/file upload (the "选择文件" button
  is a placeholder), copy/feedback button wiring.
