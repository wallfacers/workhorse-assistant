## Architecture

```
                    Layer 1: Rust SSE Reader Events (即时)
                    ═══════════════════════════════════════

┌─────────────────────────────────────────────────────────────────┐
│  spawn_sse_reader (Rust thread)                                 │
│                                                                 │
│  SSE ok ──────────────────────────── relay events as usual      │
│                                                                 │
│  SSE drop (line error / connect fail)                           │
│    │                                                            │
│    ├─ 1st failure ──▶ emit("agent://connection_lost/{sid}")     │
│    │                                                            │
│    ├─ reconnect attempt N                                       │
│    │    ├─ success ──▶ emit("agent://connection_restored/{sid}")│
│    │    └─ fail ──▶ (continue retrying)                         │
│    │                                                            │
│    └─ attempts > MAX ──▶ emit("agent://connection_failed/{sid}")│
│                         thread exits                             │
└─────────────────────────────────────────────────────────────────┘
        │                            │                          │
        ▼                            ▼                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  useAgentConnection (React hook)                                 │
│                                                                 │
│  listen("agent://connection_lost/{sid}")                        │
│    → status: 'connecting' (amber pulse, auto-retry implied)    │
│                                                                 │
│  listen("agent://connection_restored/{sid}")                    │
│    → status: 'connected' (green)                                │
│                                                                 │
│  listen("agent://connection_failed/{sid}")                      │
│    → status: 'error' (red), trigger full reconnect cycle       │
└─────────────────────────────────────────────────────────────────┘


                    Layer 2: Frontend Heartbeat (兜底)
                    ═══════════════════════════════════

┌─────────────────────────────────────────────────────────────────┐
│  useAgentConnection (connected 状态)                             │
│                                                                 │
│  每 30s:                                                        │
│    checkAgentHealth()                                           │
│      ├─ ok ──▶ 保持 connected                                   │
│      └─ fail ──▶ status: 'error'                                │
│                   触发已有的指数退避重连 (1s → 30s)              │
│                                                                 │
│  组件 unmount / disconnect() 时清理定时器                        │
└─────────────────────────────────────────────────────────────────┘
```

## State machine (updated)

```
                     mount / reconnect()
                            │
                            ▼
                   ┌───────────────┐
             ┌─────│   probing     │◀──── retry timer
             │     │  (connecting) │         (backoff)
             │     └───────┬───────┘
             │             │
             │        ┌────┴─────┐
             │        │ verified? │
             │        └────┬─────┘
             │        no   │   yes
             │     ┌───────┴────────┐
             │     ▼                ▼
             │  ┌────────┐   ┌───────────┐
             │  │ error   │   │ attaching │
             │  └────────┘   └─────┬─────┘
             │                     │
             │              ┌──────┴──────┐
             │              │  attached?  │
             │              └──────┬──────┘
             │              no     │    yes
             │          ┌──────────┴──────────┐
             │          ▼                     ▼
             │      ┌────────┐      ┌──────────────┐◀──┐
             │      │ error   │      │  connected   │   │
             │      └────────┘      │  (heartbeat  │   │
             │                      │   30s tick)  │   │
             │                      └──────┬───────┘   │
             │                             │           │
             │    ┌────────────────────────┤           │
             │    │         Layer 1         │           │
             │    │  connection_lost event  │           │
             │    │         │               │           │
             │    │         ▼               │           │
             │    │  ┌──────────────┐       │           │
             │    │  │  connecting  │       │           │
             │    │  │ (amber pulse)│       │           │
             │    │  └──────┬───────┘       │           │
             │    │         │               │           │
             │    │    ┌────┴─────┐         │           │
             │    │    │ restored? │──yes────┘           │
             │    │    └────┬─────┘                     │
             │    │    no   │                           │
             │    │         ▼                           │
             │    │  ┌──────────────┐                   │
             │    │  │ connection_  │                   │
             │    │  │ failed event │                   │
             │    │  └──────┬───────┘                   │
             │    │         ▼                           │
             │    │  ┌──────────────┐                   │
             │    │  │    error     │──reconnect()──────┘
             │    │  └──────────────┘     (full cycle)
             │    │                        from probing
             │    └────────────────────────┤
             │                             │
             │    ┌────────────────────────┤
             │    │         Layer 2         │
             │    │  heartbeat fail         │
             │    │         │               │
             │    │         ▼               │
             │    │  ┌──────────────┐       │
             │    │  │    error     │──retry─┘
             │    │  └──────────────┘
             │    └────────────────────────┤
             └── full reconnect cycle ─────┘
```

## Key design decisions

1. **`connection_lost` 只 emit 一次**：用 `lost_emitted` 标志位，避免重连过程中每轮失败都重复 emit。
2. **`connection_failed` 触发完整重连**：不是简单地设 error，而是调用 `reconnect()` 从 probe→attach 重来，因为 SSE reader thread 已退出，session 可能已失效。
3. **Heartbeat 30s 间隔**：足够短以快速检测异常，足够长以避免无谓开销。Health check 本身 3s 超时，所以最坏情况 33s 发现后端挂掉。
4. **Heartbeat 与 Layer 1 互不干扰**：如果 Layer 1 已经将 status 切到 `error`，heartbeat 不会再多此一举。heartbeat 只在 status 仍然是 `connected` 时才触发状态变更。
5. **`connection_restored` 后重置 heartbeat 计时器**：避免 heartbeat 在 Rust 重连成功后立即触发一次多余的 health check。
