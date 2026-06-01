## Context

The sidecar's `add-thinking-mode-and-prompt-cache` change already emits
`reasoning_start` / `reasoning_delta` / `reasoning_end` SSE events (verified:
`internal/agent/loop.go:473-489`, `docs/protocol.md:215-241`). The Workhorse
renderer drops them: `src-tauri/src/agent/mod.rs` dispatches SSE by `type` and
falls through unknown events to `_ => {}`; `MessagePart` in `AgentRail.tsx` is
only `text | tool_call`. data-talk has a production reasoning UI
(`client/src/features/chat/components/turn/reasoning-part.tsx`) to mirror.

Constraints: renderer-only (no sidecar/protocol change); `npm run lint`
(`tsc --noEmit`) gate; the renderer **attaches** to a sidecar it does not start
(`mod.rs:13-14`), so it cannot turn thinking on/off — only display what arrives.

## Goals / Non-Goals

**Goals:**
- Relay the three reasoning events through the Rust bridge as `agent://reasoning_*`.
- Render reasoning as a collapsible, data-talk-style section in the AgentRail.
- A persisted `autoExpandReasoning` display preference.

**Non-Goals:**
- Enabling/disabling thinking from the UI, or any `POST /v1/sessions` thinking
  override (that would require a sidecar change — explicitly deferred per the
  explore session).
- Persisting reasoning history beyond the live session.
- Rendering `signature` / redacted payload contents (never sent to the client).

## Decisions

### D1: Rust relay is pure addition, snake_case in / camelCase out

Add `ReasoningStartPayload { session_id, type }`, `ReasoningDeltaPayload
{ session_id, delta }`, `ReasoningEndPayload { session_id }`, each
`#[serde(rename_all = "camelCase")]`. Add three `match` arms before the existing
`Some("error")` arm that read the sidecar's snake_case frame fields
(`event.get("block_index")`, `"type"`, `"delta"`) and `app.emit` the three
`agent://reasoning_*` topics. The `_ => {}` fall-through is untouched. This mirrors
the existing `tool_call_*` relay exactly (the `toolCallId` camelCase precedent).

`block_index` is read but not currently needed by the UI (one reasoning part per
assistant message in V1); include it in the payload for forward-compat but the
renderer may ignore it.

**Alternative considered:** a typed `enum ServerEvent` with `#[serde(tag="type")]`
replacing the dynamic `Value` dispatch. Cleaner long-term but a larger refactor of
working code; out of scope — keep the additive `Value`-match style already in use.

### D2: One reasoning part per assistant message, accumulated by ref

`MessagePart` gains `{ type:'reasoning'; text:string; status:'streaming'|'done';
redacted?:boolean; startedAt?:number; endedAt?:number }`. Reuse the existing
`assistantIdRef` pattern: `reasoning_start` ensures an assistant message exists and
opens a reasoning part (set `startedAt`); `reasoning_delta` appends to its `text`;
`reasoning_end` sets `status:'done'` + `endedAt`. A `reasoningType` of `redacted`
sets `redacted:true` and skips deltas. Ordering: reasoning arrives before text, so
the reasoning part is naturally first in `parts`.

### D3: `ReasoningPart.tsx` mirrors data-talk

A collapsible component: a header button (chevron + label) over a bordered body.
While `status==='streaming'`, header shows a shimmer "思考中…"; when `done`, shows
a duration derived from `endedAt - startedAt` ("深度思考 Ns"). Body renders the
reasoning text via the existing `MarkdownContent` (reasoning is Markdown-ish);
benefits from `agent-chat-polish`'s streaming bypass when that lands. Redacted →
body shows a redacted marker, no text. Default collapsed; `open` is local state.

### D4: `autoExpandReasoning` lifted to the App shell + persisted

Like `isDarkMode`, the preference lives in the App shell, threaded down to
`AgentRail` (for the auto-open/close effect) and `SettingsModal` (the toggle), and
persisted to `localStorage`. `ReasoningPart`'s effect: on transition into
streaming, `setOpen(autoExpandReasoning)`; on transition out of streaming,
`setOpen(false)`. This is display-only — no network effect (spec'd).

`SettingsModal`: add the toggle under the `Agent` section (or a small "对话"
group), styled with existing tokens. Wire the two new props through
`SettingsModalProps`.

### D5: Protocol-version pre-check is a verification gate, not code

Before relying on reasoning, confirm `EXPECTED_PROTOCOL_VERSION` (`mod.rs:89`)
matches the thinking-carrying sidecar build. If the agent's
`add-health-protocol-version` branch bumped `api.ProtocolVersion`, bump the Rust
constant to match (a one-line change) — otherwise `/health` rejects the handshake
and nothing streams. Captured as a task, not a spec requirement.

## Risks / Trade-offs

- **[Reasoning never appears because the attached sidecar lacks thinking or has it
  disabled]** → By design the UI degrades silently (no reasoning part). Document
  the runtime prerequisite; verification requires a sidecar built from the
  thinking branch with `agent.thinking.enabled: true`.
- **[Protocol-version drift blocks the whole connection]** → D5 pre-check; it's a
  visible `/health` failure, not a silent reasoning drop.
- **[Reasoning + text interleave oddly if a model emits multiple thinking blocks
  per turn]** → V1 collapses to one reasoning part per assistant message; a second
  `reasoning_start` appends/reopens rather than creating a second block. Acceptable
  for V1; revisit if multi-block interleaving shows up.
- **[Markdown rendering of partial reasoning flickers]** → Mitigated once
  `agent-chat-polish` lands the code-fence streaming bypass; until then reasoning
  text is short and low-risk.

## Migration Plan

Renderer-only; no data/protocol migration. Land Rust relay first (verifiable via
event logging), then the front-end part + UI, then the preference. Rollback =
revert the changed files. Gated by `npm run lint`; Rust side compiles with
`cargo build` / `npm run tauri:dev`.

## Open Questions

- Should multiple thinking blocks per turn render as separate sections? Deferred —
  V1 is one section per message.
- Final placement of the preference (Agent section vs a new "对话" nav item) —
  minor; decided during implementation.
