## Why

`useAgentConnection` 在 mount 时探测 sidecar 健康状态、attach 成功后就把 status 设为 `connected`，之后**不再检测**。如果 sidecar 在连接建立后挂掉：

- Rust SSE reader thread 静默重连（最多 5 次），失败后线程退出——前端不知道。
- 绿点一直亮着，用户误以为 agent 还在运行。
- 直到下一次操作（发消息）失败才会暴露。

## What Changes

**双层连接健康监控**：Rust 层即时通知 + 前端周期性心跳兜底，任何一层出问题都能把绿点变红。

### 层 1：Rust SSE reader 生命周期事件

在 `spawn_sse_reader` 中，当 SSE 连接断开 / 重连成功 / 彻底放弃时，emit 新的 Tauri 事件通知前端：

- `agent://connection_lost/{sid}` — SSE 连接中断（首次失败时 emit 一次）
- `agent://connection_restored/{sid}` — 重连成功
- `agent://connection_failed/{sid}` — 达到 `RECONNECT_MAX_ATTEMPTS` 后彻底放弃

前端 `useAgentConnection` 监听这些事件，即时切换 status。

### 层 2：前端周期性心跳

进入 `connected` 状态后，启动一个 30s 间隔的定时器调用 `checkAgentHealth()`：
- 成功 → 保持 `connected`
- 失败 → 切到 `error`，触发已有的指数退避重连逻辑

这层兜底覆盖 Rust 事件丢失、线程卡死等极端情况。

## Capabilities

### New Capabilities
- `connection-health-monitor`: 双层连接健康监控——Rust SSE reader emit 连接生命周期事件 + 前端周期性 heartbeat，确保 status dot 实时反映后端存活状态。

### Modified Capabilities
- `agent-bridge-transport`: SSE reader 在连接断开/重连/放弃时向 renderer emit 连接状态事件。
- `agent-auto-connect`: `useAgentConnection` 在 `connected` 状态下监听 Rust 连接事件并启动 heartbeat 定时器。

## Impact

- **Rust bridge (`src-tauri/src/agent/mod.rs`)**: `spawn_sse_reader` 增加连接生命周期 emit；新增 `ConnectionLostPayload` / `ConnectionRestoredPayload` / `ConnectionFailedPayload`。
- **Renderer (`src/ipc/useAgentConnection.ts`)**: 增加对 `agent://connection_*` 事件的监听 + connected 状态下的 heartbeat 定时器。
- **Renderer (`src/ipc/agent.ts`)**: 新增 `subscribeConnectionEvents` 辅助函数。
- **Out of scope**: sidecar 进程管理、多 session 支持、修改 SSE 重连策略本身。
