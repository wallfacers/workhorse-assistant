## Tasks

### Task 1: Rust — 添加连接生命周期事件 payload 和 emit

**文件**: `src-tauri/src/agent/mod.rs`

1. 新增 payload struct（放在现有 payload 定义区域，约 line 130-250）：

```rust
/// Payload of `agent://connection_lost/{sessionId}` — SSE reader detected
/// the stream dropped. Emitted once per disconnect cycle; not re-emitted on
/// each reconnect attempt.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ConnectionLostPayload {
    session_id: String,
}

/// Payload of `agent://connection_restored/{sessionId}` — SSE reader
/// reconnected after a prior `connection_lost`.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ConnectionRestoredPayload {
    session_id: String,
}

/// Payload of `agent://connection_failed/{sessionId}` — SSE reader gave up
/// after RECONNECT_MAX_ATTEMPTS. The reader thread will exit.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ConnectionFailedPayload {
    session_id: String,
}
```

2. 修改 `spawn_sse_reader`（约 line 487-535），增加连接生命周期 emit：

- 在 `Err(_)` 分支（连接失败），第一次失败时 emit `connection_lost`（用局部 `bool lost_emitted = false` 控制）。
- 在 `Ok(resp)` 分支（连接成功），如果 `lost_emitted` 为 true 则 emit `connection_restored` 并重置标志。
- 在 `attempts > RECONNECT_MAX_ATTEMPTS` 退出前 emit `connection_failed`。

### Task 2: 前端 — useAgentConnection 监听 Rust 连接事件

**文件**: `src/ipc/useAgentConnection.ts`

1. 导入 `listen` 和 `UnlistenFn` from `@tauri-apps/api/event`。
2. 在 hook 中新增 ref：`unlistenConnRef` 用于存储三个事件的 unlisten 函数。
3. 当 status 变为 `connected` 且有 `sessionId` 时，订阅三个事件：
   - `agent://connection_lost/{sid}` → `setStatus('connecting')`
   - `agent://connection_restored/{sid}` → `setStatus('connected')`
   - `agent://connection_failed/{sid}` → 调用 `reconnect()` 触发完整重连
4. 在 cleanup / disconnect 时 unlisten。

### Task 3: 前端 — connected 状态下启动 heartbeat

**文件**: `src/ipc/useAgentConnection.ts`

1. 新增常量 `HEARTBEAT_INTERVAL_MS = 30_000`。
2. 新增 ref `heartbeatRef` 存储 heartbeat timer。
3. 当 status 变为 `connected` 后，启动 `setInterval`：
   - 每次触发时调用 `checkAgentHealth()`
   - 成功 → 无操作
   - 失败 → `setStatus('error')` + `scheduleRetry()`
4. 在 status 离开 `connected` / unmount / disconnect 时清理 timer。
5. `connection_restored` 事件触发时重置 heartbeat 计时器（clear + 重启）。

### Task 4: 前端 — agent.ts 暴露 connection event 订阅辅助

**文件**: `src/ipc/agent.ts`

无需新增独立函数——`useAgentConnection` 直接 import `listen` 即可，与现有 `attachAgentSession` 中的 listen 模式一致。

### Task 5: 验证

1. `npm run lint` 通过
2. 手动测试：
   - 启动 app + sidecar → 绿点亮起
   - 杀掉 sidecar 进程 → 绿点应在 ≤ 33s 内变红（Layer 2 heartbeat）
   - 理想情况：如果 SSE reader 先检测到断开，立即变琥珀色（Layer 1），然后如果重连失败则变红
   - 重启 sidecar → 应自动重连回绿点
