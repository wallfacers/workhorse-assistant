# workhorse-agent 任务书 — 会话持久化与项目（可直接交付 Go 仓）

> **给在 `workhorse-agent`（Go）仓工作的实现者（人或 AI）的自包含任务书。**
> 你**不需要**读 assistant（Tauri/TS）仓的任何代码。本文档把对接所需的全部约定
> 写全了：端点、HTTP 方法、请求/响应形状（**字段名一律 camelCase**）。
> assistant 侧的 Rust 桥**已经实现并在调用下面这些端点**（已通过编译与单测），
> 只等 Go 侧补齐端点与持久化，端到端回路即可闭合。
>
> 字段名、路径、方法是**契约**：assistant 已按这些发请求/解析响应，Go 侧需对齐。
> 若你仓里现有路由命名不同，请按"现有为准"实现并在文末『回填』一节告知差异。

---

## 1. 这个功能是什么

assistant 要支持 Claude Code / opencode 式的工作模型：

- **项目（project）= 一个本地路径**，就是创建会话时传的 `workdir`。
- **一个项目下有多个会话（session）**，每个会话的完整对话由**你（sidecar）持久化**
  到数据目录，按项目路径分桶。
- 用户可在会话间切换、**重命名**、**删除**；切走的会话**继续在后台跑**
  （assistant 会同时为多个会话各开一条 SSE 流）。

assistant **永不**读写你的数据目录——它只通过下面的 HTTP 端点消费。
**会话 id 由你分配**（创建端点返回），assistant 不自造 id。

---

## 2. 传输与运行假设（沿用现有协议）

- 默认监听 `http://127.0.0.1:7821`（assistant 可由 `WORKHORSE_AGENT_ENDPOINT`
  覆盖）。**assistant 永不 spawn 你**——用户自己长期跑着 workhorse-agent 进程。
- 既有端点（**本次不改，仅说明上下文**）：
  - `POST /v1/sessions` `{provider, workdir, model?}` → `{ "id": "<id>" }`
    （也接受 `{ "session_id": "<id>" }`）—— **创建**会话。
  - `GET  /v1/sessions/{id}/stream` → `text/event-stream` —— 订阅该会话的下行事件。
  - `POST /v1/sessions/{id}/stream` ← client message（`user_message` /
    `permission_decision` / `frontend_tool_result` / `publish_frontend_tools`）。
  - `POST /v1/sessions/{id}/cancel` —— 取消当前 turn。
- **多活并发**：assistant 会**同时**为多个会话各开一条 `GET …/stream`。你需保证：
  一个会话的 turn 在**服务端独立推进**，与有几个订阅者、是否有订阅者无关。

---

## 3. 需要新增的 HTTP 端点（assistant 的桥已在调用）

| 方法 & 路径 | 用途 | 请求 | 期望响应 |
|---|---|---|---|
| `GET /v1/sessions?workdir=<path>` | **列出**某项目的会话 | query: `workdir` | `{ "sessions": [SessionMeta] }` |
| `GET /v1/sessions/{id}/history` | **拉取** transcript 供 UI 重建 | — | `{ "messages": [HistoryMessage] }` |
| `PATCH /v1/sessions/{id}` | **重命名** | body: `{ "title": "<新标题>" }` | `SessionMeta`（更新后） |
| `DELETE /v1/sessions/{id}` | **删除**会话及其 transcript | — | `2xx`（空体即可） |
| `GET /v1/projects` | 列出已知项目路径 | — | `{ "projects": [ProjectMeta] }` |

> assistant 解析约定：list 取响应里的 `.sessions` 数组；projects 取 `.projects`
> 数组；history 取 `.messages` 数组（缺失则按空处理，不报错）。

另外，**"打开已存在会话"在 assistant 侧不调用新端点**：它直接对该会话重开一条
`GET /v1/sessions/{id}/stream`。因此要求：

- `GET …/stream` 必须能为一个**已存在、可能处于 idle**（非刚创建）的会话工作；
  重开后续 turn 的事件应正常下发。

---

## 4. 线缆形状（camelCase）

### 4.1 SessionMeta

```json
{
  "id": "ses_01J...",                 // 必填，你分配
  "workdir": "/home/user/proj",       // 必填，该会话所属项目路径（原样回传）
  "title": "重构登录流程",            // 必填（可为空串；见 §6 标题生成）
  "status": "idle",                   // 必填，枚举：'idle' | 'running'
  "createdAt": "2026-05-31T08:00:00Z",// 可选，ISO-8601
  "updatedAt": "2026-05-31T09:12:00Z",// 可选
  "messageCount": 42,                 // 可选
  "lastMessagePreview": "好的，我先看一下…" // 可选，UI 列表副标题用
}
```

- **`status` 是关键新增字段**：assistant 用它在重启/打开后判断哪些会话**正在跑**，
  需要挂活动流并显示"运行中"。有 turn 在跑 ⇒ `running`，否则 `idle`。
- 必填项：`id` / `workdir` / `title` / `status`。其余可选，assistant 容忍缺省。

### 4.2 ProjectMeta

```json
{ "path": "/home/user/proj", "sessionCount": 3, "updatedAt": "2026-05-31T09:12:00Z" }
```

至少含 `path`。可由数据目录里已有 session 的 `workdir` 反推。

### 4.3 HistoryMessage（`GET …/history` 的 `messages[]`）

用于 UI **重建已有对话**。形状与你 SSE 下行事件的"分段语义"一致——assistant
按下面的 `parts` 顺序渲染：

```json
{
  "id": "msg_...",                    // 该消息的稳定 id
  "role": "assistant",               // 'user' | 'assistant'
  "parts": [                          // 有序内容块
    { "type": "text", "content": "渲染好的 Markdown 文本" },
    { "type": "reasoning", "text": "思考过程", "redacted": false },
    { "type": "tool_call", "id": "call_1", "name": "bash", "input": {"cmd":"ls"}, "status": "done", "output": "..." }
  ]
}
```

`parts[].type` 支持的集合（与现有 SSE 事件词汇一致）：

| type | 字段 | 说明 |
|---|---|---|
| `text` | `content: string` | 助手/用户文本（Markdown） |
| `reasoning` | `text: string`, `redacted?: bool` | 思考块；持久化时 `status` 视为 `done` |
| `tool_call` | `id`, `name`, `input`, `status`('done'\|'error'), `output?` | 工具调用记录 |

> **最小可用**：先只产出 `text`（必要时加 `tool_call`）即可让重建可用；
> assistant 对未知/缺失字段是容错的。`reasoning` 可后续补。
> user 消息通常只有一个 `text` part。

---

## 5. 持久化（借鉴 Claude Code）

- 按**项目路径分桶**持久化每个会话的 transcript，例如：

  ```
  <dataDir>/projects/<编码后的-workdir>/<sessionId>.jsonl
  ```

  目录位置、编码方式、文件格式由你决定（assistant 不感知）。
- 进程**重启后**：会话仍可被 `GET /v1/sessions?workdir=` 列出、
  `GET …/history` 重建。
- `DELETE` 要**同时删除** transcript 文件。

---

## 6. 行为要求（任务项）

- **T1 持久化**：每个会话对话落盘，按 `workdir` 分桶；重启后可列出/重建。
- **T2 五端点**：实现 §3 的 list / history / rename / delete / projects。
- **T3 status 与多活并发**：在 `SessionMeta` 暴露 `idle|running`；保证 turn
  服务端独立推进，多会话 stream 可并发；**`GET …/stream` 支持重开已存在(含 idle)会话**。
- **T4 续聊真连续**：对一个 idle / 重开的会话发 `user_message` 时，用持久化的
  transcript **重建模型上下文**，让"切回旧会话继续聊"在模型记忆层面也连续
  （不只是 UI 连续）。
- **T5（可选，加分）补帧**：running 会话让晚加入的 stream 订阅者补到这一轮已发的
  事件（SSE 不回放是当前已知缺口）。不强制。
- **T6 `tool_call_done` 带结果**：该 SSE 事件**必须**携带工具结果——成功时
  `output`（任意 JSON），失败时 `error`（字符串）。assistant 的桥已 best-effort
  转发这两个字段（缺失则省略），UI 已消费：不发就只能显示"已完成"、看不到工具输出/
  报错。字段名：`output` / `error`（与现有 snake_case 事件字段风格一致）。
  对应地，`history` 的 `tool_call` part 也应回填 `output` / `status`（见 §4.3）。
- **T7 `history` 完备性（支撑前端内存淘汰）**：assistant 计划对 **idle** 会话做
  内存淘汰（卸载内存 buffer + 断开该会话的 SSE 流），用户切回时调
  `GET …/history` **重建对话**。因此 history 的 `parts` 必须能**无损重建 UI 所见**——
  至少 `text` 与 `tool_call`（含 `output` / `status`）；`reasoning` 可选（缺失只
  少了思考块，不影响主体）。这是淘汰能否落地的**硬前置**：history 不完备 ⇒ 切回旧
  会话变空白。
  - **边界**：assistant **只淘汰 `idle` 会话**。`running` 会话不淘汰，因为这一轮
    的 in-flight delta 还没落盘、不在 transcript 里——所以 history 只需覆盖**已完成
    的轮次**即可，不必包含正在流式、未结束的内容。

---

## 7. 边界 / 前向兼容（本轮不做，知会即可）

- **`workdir` 是你本机 FS 的路径**；你**不做**跨主机路径翻译。assistant 把它当作
  你命名空间里的不透明字符串原样收发。
- 后续 assistant 计划支持 **WSL 远程**（UI 在 Windows、sidecar 在 WSL）。届时会
  另行请你加一个**文件枚举端点**（`GET /v1/fs/list?path=`，让项目选择器在你命名
  空间里工作）和（可选）在 `/health` 的 capabilities 暴露平台/distro 信息。
  **本轮不需要**，提前知会以免设计冲突。

---

## 8. 开放问题（请在实现时定夺并回填本节）

1. **标题生成**：`title` 由你从首条用户消息派生（推荐），还是先回空串由用户改名？
   assistant 两种都能处理（空串显示"未命名会话"）。
2. **history 分页**：超长会话是否需要游标/范围参数？当前 assistant 一次性拉全量。
3. **`GET /v1/projects` 范围**：是否包含"注册过但零会话"的路径，还是只回有 session 的？

## 9. 回填（实现后请补充）

- 若实际路由/字段与本文不同，列在此处，assistant 侧会同步常量
  （集中在 `src-tauri/src/agent/mod.rs` 顶部）。

---

## 10. 验收（与 assistant 端到端联调）

1. assistant 打开项目 `P` → `GET /v1/sessions?workdir=P` 返回该项目会话列表
   （含 `status`）。
2. 新建会话 → 发几轮 → **重启 sidecar** → `GET …/history` 能重建该会话内容。
3. **多活**：在 A、B 两个会话各发消息 → assistant 并发订阅两条 `…/stream` →
   两者同时流式、互不干扰；其中一个 `status` 为 `running` 时列表能标出。
4. 切回一个 idle 旧会话发 `user_message` → 模型**带着历史上下文**续答（T4）。
5. `PATCH …/{id}` 改名 → 后续 list 反映新 `title`；`DELETE …/{id}` 删除 →
   list 不再包含该会话且 transcript 文件已删。
