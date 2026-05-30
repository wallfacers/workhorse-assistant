> Status: §2–§6 are implemented in the working branch (Rust bridge, TS hook, UI).
> §1 is a cross-repo prerequisite in workhorse-agent (not yet done) and §7.2–7.5
> are manual checks pending a Windows-native build with a running sidecar.

## 1. workhorse-agent (Go repo): 增强 GET /health

Cross-repo, not done. This is the prerequisite for auto-connect to succeed: if the
Go `/health` does not return `protocol_version`, the Rust `health_check` marks the
sidecar incompatible (`internal` error) and stops retrying. Coordinate per
`feedback_multi-agent-git-coordination`.

- [ ] 1.1 在 `internal/api/health.go` 的 `handleHealth` 响应中新增 `protocol_version: "1"` 和 `capabilities: ["frontend_tools"]` 字段
- [ ] 1.2 在 `internal/api/` 或 `internal/config/` 中定义 `ProtocolVersion = "1"` 和 `DefaultCapabilities` 常量
- [ ] 1.3 确认 `GET /health` 继续免 bearer auth 和 Origin 检查

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
- [ ] 7.2 手动: sidecar 先启动 → 桌面端启动 → 自动连上（绿点）
- [ ] 7.3 手动: 桌面端先启动 → sidecar 后启动 → 几秒内自动连上
- [ ] 7.4 手动: 设置中断开 → 不再重连（灰点）→ 重新连接 → 恢复
- [ ] 7.5 手动: 指向不兼容进程 → 标记 incompatible（红点），不重试
