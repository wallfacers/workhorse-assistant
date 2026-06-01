## 1. Pre-check — protocol version

- [x] 1.1 Compare `EXPECTED_PROTOCOL_VERSION` (`src-tauri/src/agent/mod.rs:90`) against `api.ProtocolVersion` in the thinking-carrying sidecar build (agent branch `add-health-protocol-version`); bump the Rust constant if it drifted — **both are `"1"`, no bump needed** (`health.go:13`)
- [x] 1.2 _(runtime)_ Confirm a sidecar built from that branch with `agent.thinking.enabled: true` is reachable at `127.0.0.1:7821` for verification — **verified** (Windows host + WSL thinking-enabled sidecar)

## 2. Rust bridge relay

- [x] 2.1 Add `ReasoningStartPayload { session_id, block_index, reasoning_type }`, `ReasoningDeltaPayload { session_id, block_index, delta }`, `ReasoningEndPayload { session_id, block_index }` structs in `src-tauri/src/agent/mod.rs`, each `#[serde(rename_all = "camelCase")]`
- [x] 2.2 Add three `match` arms (before the `Some("error")` arm) that read snake_case frame fields (`block_index`, `type`, `delta`) and `app.emit` `agent://reasoning_start/{sid}`, `agent://reasoning_delta/{sid}`, `agent://reasoning_end/{sid}`; the `_ => {}` fall-through is untouched — verified by `cargo check` (exit 0)
- [x] 2.3 _(runtime)_ Verify the relay: with thinking enabled, send a prompt and confirm the three `agent://reasoning_*` events arrive in order — **verified**

## 3. Front-end reasoning part

- [x] 3.1 Extend `MessagePart` in `AgentRail.tsx` with the `reasoning` variant (`text`, `status:'streaming'|'done'`, `redacted?`, `startedAt?`, `endedAt?`) — kept inline (not in `contract.ts`, which is the agent-ui-control cross-repo contract)
- [x] 3.2 Add `agent://reasoning_start/{sid}` listener: ensures an assistant message exists, opens a reasoning part (sets `startedAt`, `redacted` from `reasoningType`)
- [x] 3.3 Add `agent://reasoning_delta/{sid}` listener: appends `delta` to the current streaming reasoning part's `text`
- [x] 3.4 Add `agent://reasoning_end/{sid}` listener: sets the reasoning part `status:'done'` and `endedAt`
- [x] 3.5 Render the reasoning part in the assistant message branch, before text/tool parts

## 4. Collapsible reasoning UI

- [x] 4.1 Create `src/components/chat/ReasoningPart.tsx`: collapsible header (chevron + label) over a bordered body, default collapsed, using existing design tokens
- [x] 4.2 Header states: shimmer "思考中…" (animate-pulse) while `status==='streaming'`; duration label ("深度思考 N 秒" from `endedAt - startedAt`) when `done`
- [x] 4.3 Body renders reasoning text via `MarkdownContent`; redacted reasoning renders a lock marker instead of text
- [x] 4.4 Auto-open/close effect gated by `autoExpand`: expand on transition into streaming, collapse on transition out

## 5. Display preference

- [x] 5.1 Lift `autoExpandReasoning` state to the App shell with `localStorage` persistence (`workhorse:autoExpandReasoning`), defaults collapsed
- [x] 5.2 Thread it down to `AgentRail` (for the effect) and `SettingsModal` (extended `SettingsModalProps`)
- [x] 5.3 Add the toggle to `SettingsModal` (Agent section, "推理显示" group), styled with existing tokens; the handler only flips local state — sends no request to the sidecar

## 6. Verify & gate

- [x] 6.1 _(runtime)_ End-to-end against a thinking-enabled sidecar: reasoning section appears, streams, settles with a duration, collapses; redacted block shows a marker; auto-expand preference behaves both on and off — **verified** (Windows host + WSL thinking-enabled sidecar)
- [x] 6.2 _(runtime)_ Confirm graceful degradation: against a sidecar without thinking (or disabled), no reasoning section appears and chat is unaffected — **verified**
- [x] 6.3 `npm run lint` (tsc --noEmit) passes; `npm test` passes (22/22); Rust side compiles (`cargo check` exit 0)
