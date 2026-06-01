# §4 实现简报 — workhorse-agent（Go 仓）

> 给在 `workhorse-agent` 仓工作的实现者（人或 AI）的**自包含**任务书。
> 你不需要读 assistant（Tauri/TS）仓的代码——本文档 + 下面引用的线缆契约
> 就是全部约定。assistant 侧的桥（Rust）已经按这套契约实现并通过编译/单测，
> 只等 Go 侧把 4 个端点和"前端工具"类补齐，端到端回路即可闭合。

## 背景：这块解决什么

assistant 是一个 Tauri 桌面应用。它想让 **workhorse-agent 里的模型**能够
"操作页面按钮 / 读按钮状态 / 开页面"。做法不是在 Go 里硬编 UI 工具，而是：

1. assistant 在 session 启动时把它当前的 UI 工具**目录**（`open_tab`、
   `get_open_tabs`、`click_by_testid` 等）POST 给 workhorse-agent。
2. workhorse-agent 把这些目录项**注册成该 session 模型可见的工具**。
3. 当模型决定调用其中某个工具时，workhorse-agent **不在本地执行**，而是把这次
   `tool_use` 通过 SSE 发回 assistant；assistant 在浏览器里真正执行（点按钮 /
   读状态），再把 `tool_result` POST 回来；workhorse-agent 拿到结果续跑这一轮。

也就是说：你要新增的是一类"**代理/前端工具**"——它的 `Run()` 把调用**外包**给
渲染层，而不是在 Go 内执行。其余（模型循环、超时、取消、并行批处理）尽量复用现有
机制。

## 线缆契约（必须严格遵守）

完整版见 assistant 仓 `openspec/changes/agent-ui-control/contract.md`。以下为
Go 侧需要实现/消费的全部形状。**字段名是 camelCase。**

### 1) HTTP 端点（assistant 的 Rust 桥会调用这些）

| 方法 & 路径 | 方向 | 请求体 | 响应体 |
|---|---|---|---|
| `POST /v1/sessions` | assistant→agent | （空或现有约定） | `{ "session_id": "<id>" }` |
| `GET  /v1/sessions/{id}/events` | assistant 订阅 | — | `text/event-stream`（见下） |
| `POST /v1/sessions/{id}/events` | assistant→agent | 一个 client event（见下） | 2xx 即可 |
| `POST /v1/sessions/{id}/tools` | assistant→agent | `{ "catalog": [ToolCatalogEntry] }` | `CatalogPublishResult`（见下） |

> 若现有路由命名不同，**以现有为准并回填到 `contract.md`**——assistant 侧的
> 端点常量集中在 `src-tauri/src/agent/mod.rs` 顶部，改动需同步给 assistant 仓。

### 2) SSE 下行事件（agent→assistant，在 `GET …/events` 流里）

每个事件一帧 `data: <json>\n\n`。需要中继给 UI 的是 `tool_use`：

```json
{ "type": "tool_use", "tool_use_id": "<id>", "name": "open_tab", "input": { "profileId": "terminal" } }
```

其它类型的事件 assistant 会忽略，你可以照常发自己的事件。

### 3) 上行 client event（assistant→agent，POST 到 `…/events`）

```json
{ "type": "tool_result", "tool_use_id": "<同一个 id>", "result": <Result 信封> }
```

`Result 信封`：

```json
// 成功
{ "ok": true, "value": <任意，形状由该工具 outputSchema 描述> }
// 失败
{ "ok": false, "error": { "kind": "<kind>", "message": "...", "details": <可选> } }
```

`kind` ∈ `validation | not_found | transient | internal | forbidden`。
失败信封一律映射成 `is_error: true` 的 tool_result（见 4.4）。

### 4) 工具目录项 & 发布结果

```json
// ToolCatalogEntry
{
  "name": "open_tab",
  "description": "模型可读的说明",
  "inputSchema":  { /* JSON Schema，作为该工具对模型暴露的参数 */ },
  "outputSchema": { /* JSON Schema，描述 value 形状；void 用 {"type":"null"} */ },
  "parallelSafety": "safe" | "unsafe"
}

// CatalogPublishResult（POST …/tools 的响应）
{ "registered": ["open_tab","get_open_tabs"], "rejected": [ { "name":"read", "reason":"collides with server-side tool" } ] }
```

`parallelSafety:"unsafe"` 的工具**不可**与别的工具并发批处理（映射到你现有的
`CanRunInParallel()` 之类机制——actions 是 unsafe，只读 readers 是 safe）。

## 任务项（对应 assistant tasks.md 的 §4）

### 4.1 新增"代理/前端工具"类
- 实现一个 Tool，其 `Run(ctx, toolUseId, input)`：
  1. 把 `{type:"tool_use", tool_use_id, name, input}` 写入该 session 的 SSE 下行流；
  2. **挂起**，等待匹配 `tool_use_id` 的 `tool_result` client event 到达；
  3. 拿到后把 `result` 作为该工具的输出返回给模型循环。
- 复用现有的超时 / 取消 / panic 恢复语义（不要新造一套）。
- 该工具的 `CanRunInParallel()` 由目录项的 `parallelSafety` 决定。

### 4.2 超时兜底
- 若超时仍无匹配 `tool_result`：合成一个 `is_error: true` 的 tool_result（消息如
  `"frontend tool timed out"`）并续跑，**绝不能让这一轮永久挂起**。

### 4.3 session 级动态目录注册（`POST …/tools`）
- 把 catalog 里的每一项注册成**该 session** 模型可见的工具（其它 session 不受影响）。
- **重新发布即替换**该 session 的前端工具集（assistant 在 UI 变化时会重发）。
- **逐项名字冲突检查**：若某项 `name` 与该 session 已有的**服务端工具**重名 →
  **拒绝该项**（保留权威的服务端工具），并在响应的 `rejected` 里报告原因；同一目录里
  不冲突的项照常注册。
- 被新目录移除的工具，之后若被调用，返回 `not_found`（别挂起）。

### 4.4 错误信封映射
- 渲染层回传 `{ok:false, error:{kind,message}}` 时，记为 `is_error: true` 的
  tool_result，把 `message` 带给模型，让模型循环像处理任何工具失败一样处理它。

## 边界 & 注意

- **session id 由 agent 分配**（`POST /v1/sessions` 返回），assistant 不自造 id。
- **顺序**：assistant 侧已用单调 `seq` 给下行事件排序，你只需保证 SSE 帧的发送
  顺序即可，无需额外编号。
- **SSE 重连缺口**：assistant 在重连窗口内可能漏收下行 `tool_use`（SSE 不回放）。
  这由 4.2 的超时兜底覆盖；你**可选**地缓冲最近事件，但契约不强制。
- **assistant 永不 spawn agent**：用户自己长期跑着 workhorse-agent 进程。你只需
  正常监听（默认 `127.0.0.1:7821`，assistant 可由 `WORKHORSE_AGENT_ENDPOINT` 覆盖）。

## 验收（与 assistant 端到端联调，对应 §5.1–5.3）

1. assistant 点「连接 Agent」→ 你的 `POST /v1/sessions` 返回 id，`POST …/tools`
   收到目录、返回 `registered` 含 `open_tab`/`get_open_tabs` 等。
2. 让模型调用 `open_tab {profileId:"terminal"}` → 你发下行 `tool_use` → assistant
   真的开出一个终端 tab → 回传 `{ok:true,value:null}` → 模型续跑。
3. 让模型调用 `get_open_tabs` → 拿回 `{ok:true, value:[{index,label,active}...]}`。
4. 丢弃一次 `tool_result`（或断开 UI）→ 确认 4.2 超时兜底让这一轮以 `is_error` 收尾，
   不挂死。
5. 发布一个与服务端工具重名的目录项 → 确认它进 `rejected`、服务端工具仍在、其余项正常。
```
