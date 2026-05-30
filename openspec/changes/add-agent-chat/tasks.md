> Status: this change back-fills the spec for code already landed in the working
> branch. Boxes are checked to reflect what is implemented; unchecked boxes are
> genuine follow-ups.

## 1. Rust: user message uplink

- [x] 1.1 `agent::send_message(session_id, content)` POSTs `{type:"user_message", content}` to `/v1/sessions/{id}/stream`
- [x] 1.2 `#[tauri::command(async)] agent_send_message` registered in `generate_handler![]`

## 2. Rust: assistant + tool-call SSE relay

- [x] 2.1 `relay_event` arm `assistant_text_delta` → `agent://text/{id}` (`TextDeltaPayload {delta}`)
- [x] 2.2 `relay_event` arm `assistant_text_done` → `agent://textdone/{id}` (`TextDonePayload {messageId, stopReason}`)
- [x] 2.3 `relay_event` arm `tool_call_start` → `agent://toolstart/{id}` (`ToolStartPayload {toolCallId, name, input}`)
- [x] 2.4 `relay_event` arm `tool_call_done` → `agent://tooldone/{id}` (`ToolDonePayload {toolCallId}`)

## 3. TS: send + subscribe

- [x] 3.1 `sendAgentMessage(content)` invokes `agent_send_message` for the active session
- [x] 3.2 AgentRail subscribes to `agent://text|textdone|toolstart|tooldone/{sessionId}` for the active session
- [x] 3.3 Event field names read as **camelCase** to match the Rust `rename_all = "camelCase"` payloads (`toolCallId`, not `tool_call_id`) — fixed regression where tool blocks never paired

## 4. UI: live conversation

- [x] 4.1 `MarkdownContent` renders assistant Markdown (streaming-aware)
- [x] 4.2 `ToolCallBlock` renders a tool call with `running`/`done`/`error` status
- [x] 4.3 `StreamingText` paces delta reveal (typewriter)
- [x] 4.4 `useAutoScroll` follows new output, yields to manual scroll-up, exposes a scroll-to-bottom affordance
- [x] 4.5 Send is disabled unless `agent.status === 'connected'`

## 5. 验证

- [x] 5.1 `npm run lint` 通过
- [x] 5.2 `cargo check` 通过
- [ ] 5.3 真机验证（部分完成，端到端未通过）: POST `{type:"user_message"}` 返回 **202**（上行通），SSE 流确实回流了事件（回流通道工作）。但**完整助手文本往返未跑通**：运行中的 sidecar 回 `provider_invalid_request: model "claude-sonnet-4-6" is not supported`——前端 `DEFAULT_MODEL` 与该 sidecar 实例不匹配。`assistant_text_delta/done` 流式回显与工具块 running→done 的端到端验证，待 model 不匹配修复后在桌面窗口实操确认
