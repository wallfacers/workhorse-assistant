## 1. Wire contract (shared, do first)

- [x] 1.1 Define the catalog entry type `{name, description, inputSchema, outputSchema}` and the result envelope `{ok, value} | {ok:false, error:{kind,message}}` in `src/agent/contract.ts`; add `forbidden` to `IpcErrorKind` in `src/ipc/result.ts`
- [x] 1.2 Define the bridge event/command payloads: downstream `tool_use` `{sessionId, seq, toolUseId, name, input}` (seq = bridge-assigned monotonic per-session) and upstream `tool_result` `{sessionId, toolUseId, result}`; sessionId is the sidecar-allocated agent session id
- [x] 1.3 Document the contract in the change (no code in Go yet) so the workhorse-agent repo can implement against it

## 2. TS UI control surface (`ui-control-surface`)

- [x] 2.1 Implement the action registry in `src/agent/actionRegistry.ts` (`registerAction`, lookup, execute → result envelope, `not_found` on miss, try-catch handler → `internal` so exceptions never propagate to the bridge client)
- [x] 2.2 Implement the state registry in `src/agent/stateRegistry.ts` (`registerState`, side-effect-free readers)
- [x] 2.3 Implement generic fallback tools in `src/agent/fallbackTools.ts`: `click_by_testid` requires `data-testid` + `data-agent-clickable` + visible (non-null `offsetParent`, non-zero box), returns `forbidden` if opt-in missing / `not_found` if absent-or-hidden; `read_by_testid` needs only `data-testid`, returns `{tagName, textContent, disabled, visible}` (never `innerHTML`)
- [x] 2.4 Implement concurrency control: serialize action handlers by `seq`-order (do NOT rely on Tauri emit ordering), allow concurrent state readers (live snapshot, no read-write lock); tag tools parallel-unsafe (actions) / parallel-safe (readers)
- [x] 2.5 Implement catalog assembly `buildCatalog()` + manual `republishCatalog()` in `src/agent/catalog.ts` (unique names, valid schemas; re-publish replaces the session set; components call republish from mount/unmount effects)
- [x] 2.6 Register first real actions/state in existing components: `open_tab`, `focus_tab` (groups are addressed by index, not UUID), `get_button_state`, `get_open_tabs`; add `data-testid` + `data-agent-clickable` to key buttons (`open-work-panel`, `new-terminal-group`)
- [x] 2.7 Unit tests (vitest + jsdom): each registry (register/execute/miss), opt-in refusal (`forbidden`), hidden-element (`not_found`), `read_by_testid` field subset, `seq`-ordered serialization, catalog assembly + re-publish — 22 tests passing
- [x] 2.8 Activation entry point (closes the "client built but never called" gap): `useAgentConnection` hook + an explicit "连接 Agent" control in `AgentRail` footer that calls `attachAgentSession()` (attach + publish catalog + subscribe). Without this the bridge client is dead code; with it the assistant half of the loop is live and waits only on a running sidecar + §4.

## 3. Rust bridge transport (`agent-bridge-transport`)

- [x] 3.1 Implement the sidecar HTTP/SSE connection in `src-tauri/src/`: resolve endpoint from config (default `127.0.0.1:7821`), lazy connect on first attach, do NOT spawn the sidecar; bounded reconnect on SSE drop
- [x] 3.2 Add Tauri commands to attach a sidecar session (create via sidecar `POST /v1/sessions`, return the sidecar-allocated session id to the renderer) and publish/re-publish the catalog upstream; return `transient` error if the sidecar is unreachable
- [x] 3.3 Add a Tauri command to forward a renderer `tool_result` upstream preserving `tool_use_id`
- [x] 3.4 Relay downstream `tool_use` from the sidecar SSE to the renderer as a per-session Tauri event `agent://tooluse/{sessionId}`, stamping each with a monotonic per-session `seq`
- [x] 3.5 On app shutdown (`RunEvent::Exit`/`WindowEvent::Destroyed`, mirroring PTY `kill_all`), best-effort drain pending upstream `tool_result` before exiting
- [x] 3.6 Confirm no `capabilities/default.json` changes are needed for the custom commands and no `fs/shell/http` grants are added
- [x] 3.7 Renderer bridge client `src/ipc/agent.ts`: subscribe to `tool_use` events, order by `seq` (never by arrival), dispatch to registries, return results via command (typed `Result<T>`). **Depends only on §1 contract — can be built in parallel with 3.1–3.6 against a mock event.**

## 4. workhorse-agent (Go repo, COORDINATED FOLLOW-UP)

> Wire contract is fixed by §1 and the specs; TS+Rust are validated against a mock `tool_use` first. This group lands in the workhorse-agent repo on its own cadence (per `feedback_multi-agent-git-coordination`). **Implemented** in the workhorse-agent change `add-frontend-tool-bridge` (proxy `frontend.Tool` + per-session `Bridge` + `publish_frontend_tools`/`frontend_tool_result` on `/stream`); reviewed (build/vet/-race green).

- [x] 4.1 Add the proxy/frontend tool class: `Run()` emits `frontend_tool_use` and awaits matching `frontend_tool_result` by bridge-minted id, reusing orchestrator timeout/cancel; `parallelSafety` drives `CanRunInParallel`, `IsReadOnly` always false
- [x] 4.2 On timeout, synthesize an `is_error` `tool_result` so the turn never hangs (free via the orchestrator's `context.WithTimeout` wrapper)
- [x] 4.3 `publish_frontend_tools` (Idle-only) registers/replaces the catalog in the session's cloned tool surface; per-entry name collisions with server-side tools rejected (server-side retained) and reported in `frontend_tools_published`
- [x] 4.4 Map renderer `{ok,...}` envelopes to `is_error` tool_results (`Bridge.parseResult`)

## 5. End-to-end verification

- [~] 5.0 Mock validation (no Go): renderer-side execution validated at unit level — `dispatch.test.ts` injects synthetic `tool_use` payloads and confirms execute→result round-trip; Rust error paths covered by `cargo test`. Full injection through the *running* Rust bridge (emit→listen→forward) still needs the live app.
- [ ] 5.1 Manual (needs running app + live sidecar): agent opens a tab, reads a button's state, and clicks a button via a registered action
- [ ] 5.2 Manual (needs running app + live sidecar): agent clicks a long-tail button via `click_by_testid`
- [ ] 5.3 Manual (needs running app + live sidecar): drop a renderer result and confirm the agent recovers with an error tool_result
- [x] 5.4 Confirm renderer makes no direct network call to the sidecar — verified by code review: `src/ipc/agent.ts` only `invoke`s Rust commands + `listen`s for events; no `fetch`/`EventSource`/`WebSocket`. All sidecar HTTP lives in `src-tauri/src/agent/mod.rs`.
- [x] 5.5 `npm run lint` passes (exit 0); docs updated in the same change (`contract.md` added, design.md "Implementation Notes")

## 6. Protocol realignment (discovered after §3 — §3 was built against assumed `/events`+`/tools` endpoints; the real agent protocol is `/v1/sessions/{id}/stream`)

- [x] 6.1 Rust bridge (`src-tauri/src/agent/mod.rs`): `POST /v1/sessions` now sends `{provider, model, workdir}` (provider/model env-defaulted, workdir from renderer / app cwd) and reads `id`; SSE subscribe + tool_result + publish all moved to `POST|GET /v1/sessions/{id}/stream`
- [x] 6.2 Message/event names realigned: forward `frontend_tool_result`, publish `publish_frontend_tools`; relay server events `frontend_tool_use` → `agent://tooluse/{id}` and `frontend_tools_published` → `agent://published/{id}`
- [x] 6.3 Publish result is now async: `agent_publish_catalog` returns `()` on 202; `CatalogPublisher` is fire-and-forget; renderer subscribes `agent://published/{id}` and stashes the outcome (`lastPublishResult()`). `contract.md` updated with the real HTTP surface
- [x] 6.4 `npm run lint`, 22 vitest, `cargo build`/`clippy` (clean)/`cargo test` (9) all green

## 7. 联调 runbook & cross-repo open items (回家测试用)

> §5.1–5.3 的手动 E2E 需要本机同时起 assistant 桌面端 + 一个 live workhorse-agent sidecar。代码侧已全绿(§6.4);以下是把链路真正跑通所需的前置条件、联调步骤,以及会影响联调的另一仓未决项。

### 7.1 前置条件
- [ ] workhorse-agent 仓起 sidecar(`serve`),监听默认 `127.0.0.1:7821`;非默认地址用 `WORKHORSE_AGENT_ENDPOINT` 覆盖
- [ ] 确认默认 provider/model(`anthropic` / `claude-sonnet-4-6`)是 sidecar provider 注册表认识的;否则用 `WORKHORSE_AGENT_PROVIDER` / `WORKHORSE_AGENT_MODEL` 覆盖,否则 `POST /v1/sessions` 4xx → attach 报 `transient`
- [ ] sidecar 自身配好 LLM 凭证(agent 仓配置),否则 turn 起不来
- [ ] `npm run tauri:dev` 起 assistant,点 AgentRail 底部"连接 Agent"

### 7.2 联调步骤(= §5.1–5.3)
- [ ] 5.1 attach 拿到 sidecar `id`;catalog publish 后 `agent://published/{id}` 回来的 `registered` 含 `open_tab`/`focus_tab`/`get_open_tabs`/`get_button_state` + 兜底 `click_by_testid`/`read_by_testid`;模型开 tab、读按钮态、点按钮 → `frontend_tool_use` → 渲染层执行 → `frontend_tool_result` 回传 → turn 推进
- [ ] 5.2 模型用 `click_by_testid` 点一个长尾按钮(无专用 action 的)
- [ ] 5.3 中途丢一个 result(或 kill sidecar),确认 agent 侧 tool 超时合成 `is_error`、turn 不挂

### 7.3 会影响联调的 workhorse-agent 仓未决项(审 `add-frontend-tool-bridge` 时记录)
- [ ] 🟡 `Session.Frontend` 字段无锁读写(loop 写 / HTTP 读)——当前靠 mu 流量 + 网络 RTT 侥幸不报 race,建议上 mu 守护访问器(联调前先修)
- [ ] 🟡 该 change 的 design D5 / tasks 3.1 与实现矛盾(惰性 clone 是必须的,"前置条件已满足"是错的)——需回填文档
- [ ] 🟢 空 catalog 时 `frontend_tools_published` 发 `null` 而非 `[]`(assistant 的 Rust 桥已兜底归一为 `[]`,但建议 Go 侧也初始化为 `[]`)
- [ ] 🟢 死代码 `SetFrontendToolNames`;`NewTool` 用匿名 struct 当参数;若干陈旧注释("five/eleven types")
> 以上在 workhorse-agent 仓修,不阻塞本仓提交;两条 🟡 建议联调前先处理,避免 race / 文档误导。
