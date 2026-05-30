## Why

The `workhorse-agent` sidecar now streams Anthropic extended-thinking as three
SSE events — `reasoning_start` / `reasoning_delta` / `reasoning_end` (from its
`add-thinking-mode-and-prompt-cache` change). The Workhorse renderer cannot see
any of it: the Rust bridge's SSE dispatch silently drops unknown event types
(`mod.rs` `_ => {}`), and the front-end message model (`MessagePart`) only knows
`text` and `tool_call`. So the model's reasoning is produced upstream but never
surfaced in the AgentRail.

This change wires that reasoning stream end-to-end **inside Workhorse only** — the
Rust bridge relays the three events, and the AgentRail renders them as a
collapsible "thinking" section (data-talk parity). No backend, protocol, or
sidecar change: we consume events the sidecar already emits.

## What Changes

- **Rust bridge relay**: add three `#[serde(rename_all = "camelCase")]` payload
  structs and three `match` arms in `src-tauri/src/agent/mod.rs` that read the
  sidecar's snake-case fields (`block_index`, `type`, `delta`) and emit
  `agent://reasoning_start/{sid}`, `agent://reasoning_delta/{sid}`,
  `agent://reasoning_end/{sid}`. Unknown-event fall-through is unchanged.
- **Front-end reasoning part**: extend `MessagePart` with a `reasoning` variant.
  `AgentRail` adds three listeners that accumulate `reasoning_delta` text into the
  current assistant message's reasoning part, bracketed by `start`/`end`.
- **Collapsible reasoning UI**: a new `ReasoningPart` component (mirroring
  data-talk's `reasoning-part.tsx`) renders a collapsible section — a shimmering
  "thinking…" label while streaming, a duration label when done, auto-expand on
  start / auto-collapse on end (gated by the user preference), default collapsed.
- **Display preference**: `SettingsModal` gains an `autoExpandReasoning` toggle.
  This is a **display preference only** (does the section auto-open) — it does NOT
  enable/disable thinking. Whether thinking runs is decided by the sidecar's own
  config (`agent.thinking` YAML), because the renderer attaches to a sidecar it
  does not start. The preference is lifted to the App shell and persisted
  (localStorage), like `isDarkMode`.
- **Protocol-version pre-check**: confirm `EXPECTED_PROTOCOL_VERSION`
  (`mod.rs:89`) still matches the sidecar build that carries thinking (the agent's
  current branch is `add-health-protocol-version`); a mismatch fails the
  `/health` handshake before any reasoning can flow.

## Capabilities

### New Capabilities
- `reasoning-bridge`: the Rust sidecar bridge's relay of the sidecar's
  `reasoning_start` / `reasoning_delta` / `reasoning_end` SSE events into
  `agent://reasoning_*` Tauri events, including the snake_case→camelCase field
  convention and redacted-thinking handling.
- `chat-reasoning`: how the AgentRail accumulates and renders the reasoning
  stream — the `reasoning` message part, the collapsible thinking section, and the
  `autoExpandReasoning` display preference.

### Modified Capabilities
<!-- None published. `agent-chat` (text/tool streaming) stays in the change phase;
     this introduces reasoning as new capabilities alongside it. -->

## Impact

- **Code**: `src-tauri/src/agent/mod.rs` (3 structs + 3 match arms — pure
  additions), `src/components/AgentRail.tsx` (MessagePart variant + 3 listeners +
  accumulation), new `src/components/chat/ReasoningPart.tsx`,
  `src/components/SettingsModal.tsx` (preference toggle), the App shell
  (`autoExpandReasoning` state + persistence), optionally `src/agent/contract.ts`
  (TS payload types).
- **No backend / protocol / sidecar change.** Consumes existing SSE events.
- **Runtime prerequisite (verification only)**: the attached sidecar must be a
  build carrying the thinking change, and `agent.thinking.enabled` must be true in
  its config, for reasoning events to actually flow. The renderer degrades
  silently (no reasoning section) when they don't.
- **Risk**: low for the relay/render; the one external coupling is the protocol
  version, which is explicitly pre-checked.
