> Status: §1–§6 implemented (Go sidecar + Rust bridge + TS hook + UI). §7.2–7.5
> are manual checks pending a Windows-native build with a running sidecar.

## 1. workhorse-agent (Go repo): 增强 GET /health

Done in the workhorse-agent repo as openspec change `add-health-protocol-version`
(branch `add-health-protocol-version`): `/health` now returns `protocol_version:"1"`
and `capabilities:["frontend_tools","external_agents"]`. Both repos agree on the
value `"1"` (Rust `EXPECTED_PROTOCOL_VERSION` ↔ Go `protocol.ProtocolVersion`),
per `feedback_multi-agent-git-coordination`.

- [x] 1.1 在 `internal/api/health.go` 的 `handleHealth` 响应中新增 `protocol_version: "1"` 和 `capabilities` 字段
- [x] 1.2 在 `internal/api/protocol/protocol.go` 中定义 `ProtocolVersion = "1"` 和 `DefaultCapabilities` 常量
- [x] 1.3 确认 `GET /health` 继续免 bearer auth 和 Origin 检查（无 middleware 改动）

## 2. Rust bridge: agent_health_check 命令

- [x] 2.1 `agent::health_check()`：`GET {endpoint}/health`，3s 超时，解析为 `HealthInfo {ok, version, protocol_version, capabilities}`
- [x] 2.2 新增 `HealthInfo` struct（Deserialize）
- [x] 2.3 `agent_health_check` 命令注册到 `generate_handler![]`
- [x] 2.4 确认无需修改 `capabilities/default.json`

## 3. TS: useAgentConnection 自动连接重写

- [x] 3.1 新增 refs: `pausedRef`、`attemptRef`、`retryTimerRef`
- [x] 3.2 `tryConnect()`：`checkAgentHealth()` → 验证（Rust 侧 protocol_version + ok）→ `attachAgentSession()`
- [x] 3.3 `scheduleRetry()`：指数退避 `min(1000 * 2^n, 30000)`
- [x] 3.4 `disconnect()`：设 `pausedRef = true`，清 timer，调 `detachAgentSession()`
- [x] 3.5 `reconnect()`：设 `pausedRef = false`，reset attempt，调 `tryConnect()`
- [x] 3.6 mount effect：非 Tauri 直接 return；否则自动 `tryConnect()`；unmount 清 timer + detach
- [x] 3.7 `AgentConnection` 接口：移除 `connect`，新增 `reconnect`

## 4. TS: agent.ts 新增 checkAgentHealth

- [x] 4.1 `checkAgentHealth(): Promise<Result<HealthInfo>>` invoke `agent_health_check`
- [x] 4.2 定义 `HealthInfo` 类型
- [x] 4.3 在 `src/ipc/index.ts` 导出

## 5. UI: AgentRail 去掉连接按钮，加状态圆点

- [x] 5.1 删除 footer 中的连接按钮
- [x] 5.2 avatar 右侧加 `w-1.5 h-1.5` 状态圆点，`title` 显示状态详情
- [x] 5.3 状态 UI 改为 `AGENT_STATUS_DOT` / `AGENT_STATUS_TITLE`

## 6. UI: SettingsModal 新增 Agent tab

- [x] 6.1 `NavItem` 新增 `'Agent'`，左侧导航加按钮
- [x] 6.2 `AgentSection` 组件：连接状态、endpoint（只读）、断开/重连按钮
- [x] 6.3 `SettingsModalProps` 新增 `agent: AgentConnection`
- [x] 6.4 按钮调用 `agent.disconnect()` / `agent.reconnect()`，`connecting` 禁用

## 7. 验证

- [x] 7.1 `npm run lint` 通过
- [x] 7.2 真机验证: sidecar 先运行 → 桌面端（`tauri:dev`）启动 → 自动连上。证据: sidecar `/health` 返回 `protocol_version:"1"`，桌面端启动后 sidecar `sessions_active` 9→11（attach 成功）；`status==='connected'` ⇒ 圆点 `bg-green-500`（`AgentRail.tsx`）
- [ ] 7.3 手动: 桌面端先启动 → sidecar 后启动 → 几秒内自动连上 — 未按此时序实测（重启时 sidecar 已在运行）；退避重试逻辑见 `useAgentConnection.scheduleRetry`，待按此顺序手测
- [ ] 7.4 手动: 设置中断开 → 不再重连（灰点）→ 重新连接 → 恢复 — 需在桌面窗口的 Settings→Agent tab 点击操作，命令行无法触发，待手测
- [x] 7.5 协议契约验证: 前端 `EXPECTED_PROTOCOL_VERSION = "1"`（`mod.rs:92`）与 sidecar `/health` 返回的 `protocol_version:"1"` 一致 ⇒ 兼容路径通；不匹配走 `incompatible sidecar`（`mod.rs:122`）internal 错误且不重试（逻辑分支已确证，红点 UI 待手测触发）
