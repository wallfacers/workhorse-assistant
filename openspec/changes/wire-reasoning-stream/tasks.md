## 1. Pre-check — protocol version

- [ ] 1.1 Compare `EXPECTED_PROTOCOL_VERSION` (`src-tauri/src/agent/mod.rs:89`) against `api.ProtocolVersion` in the thinking-carrying sidecar build (agent branch `add-health-protocol-version`); bump the Rust constant if it drifted
- [ ] 1.2 Confirm a sidecar built from that branch with `agent.thinking.enabled: true` is reachable at `127.0.0.1:7821` for verification

## 2. Rust bridge relay

- [ ] 2.1 Add `ReasoningStartPayload { session_id, type }`, `ReasoningDeltaPayload { session_id, delta }`, `ReasoningEndPayload { session_id }` structs in `src-tauri/src/agent/mod.rs`, each `#[serde(rename_all = "camelCase")]`
- [ ] 2.2 Add three `match` arms (before the `Some("error")` arm) that read snake_case frame fields (`block_index`, `type`, `delta`) and `app.emit` `agent://reasoning_start/{sid}`, `agent://reasoning_delta/{sid}`, `agent://reasoning_end/{sid}`; leave the `_ => {}` fall-through untouched
- [ ] 2.3 Verify the relay: with thinking enabled, send a prompt and confirm the three `agent://reasoning_*` events arrive in order (temporary log or devtools listener)

## 3. Front-end reasoning part

- [ ] 3.1 Extend `MessagePart` in `AgentRail.tsx` with the `reasoning` variant (`text`, `status:'streaming'|'done'`, `redacted?`, `startedAt?`, `endedAt?`); optionally mirror the payload types in `src/agent/contract.ts`
- [ ] 3.2 Add `agent://reasoning_start/{sid}` listener: ensure an assistant message exists, open a reasoning part (set `startedAt`, `redacted` from `type`)
- [ ] 3.3 Add `agent://reasoning_delta/{sid}` listener: append `delta` to the current reasoning part's `text`
- [ ] 3.4 Add `agent://reasoning_end/{sid}` listener: set the reasoning part `status:'done'` and `endedAt`
- [ ] 3.5 Render the reasoning part in the assistant message branch, before text/tool parts

## 4. Collapsible reasoning UI

- [ ] 4.1 Create `src/components/chat/ReasoningPart.tsx`: collapsible header (chevron + label) over a bordered body, default collapsed, using existing design tokens
- [ ] 4.2 Header states: shimmer "思考中…" while `status==='streaming'`; duration label ("深度思考 Ns" from `endedAt - startedAt`) when `done`
- [ ] 4.3 Body renders reasoning text via `MarkdownContent`; redacted reasoning renders a redacted-thought marker instead of text
- [ ] 4.4 Auto-open/close effect gated by `autoExpandReasoning`: expand on transition into streaming, collapse on transition out

## 5. Display preference

- [ ] 5.1 Lift `autoExpandReasoning` state to the App shell with `localStorage` persistence (mirror the `isDarkMode` pattern)
- [ ] 5.2 Thread it down to `AgentRail` (for the effect) and `SettingsModal` (extend `SettingsModalProps`)
- [ ] 5.3 Add the toggle to `SettingsModal` (Agent section or a small "对话" group), styled with existing tokens; confirm changing it sends no request to the sidecar

## 6. Verify & gate

- [ ] 6.1 End-to-end in `npm run tauri:dev` against a thinking-enabled sidecar: reasoning section appears, streams, settles with a duration, collapses; redacted block shows a marker; auto-expand preference behaves both on and off
- [ ] 6.2 Confirm graceful degradation: against a sidecar without thinking (or disabled), no reasoning section appears and chat is unaffected
- [ ] 6.3 `npm run lint` (tsc --noEmit) passes; `npm test` passes; Rust side builds (`npm run tauri:dev` / `cargo build`)
