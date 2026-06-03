## Context

设置页是 `src/components/SettingsModal.tsx`（React 19 + TS，Tailwind v4 token，i18next）。现有 4 个 tab：主题/快捷键/智能体/会话。前端经 `invoke()` 调 Rust command（`src/ipc/*.ts` 类型化包装，Result 模式，不抛异常）；Rust `AgentBridge`（`src-tauri/src/agent/mod.rs`）持有到 sidecar 的 HTTP 连接，已有 `list_sessions`/`rename_session`/`delete_session` 等方法是标准范式。渲染层禁止直连 sidecar（见 `agent-bridge-transport`）。

本 change 依赖 workhorse-agent 的 `hot-reload-permission-config`：消费其 `GET /v1/permissions`（既有，回读生效规则）与新增的 `GET/PUT /v1/permission-config`（读/写 config.yaml 权限段，保留注释，写后热加载生效）。

## Goals / Non-Goals

**Goals:**
- 设置页可视化查看与编辑永久权限规则与默认策略，配置即永久生效（经 agent 热加载，下个 loop 生效）。
- 单一真源 config.yaml；写入只经 `/v1/permission-config`。
- native/WSL/远程三模式一致；渲染层零直连。
- 文案全 i18n、样式全 token。

**Non-Goals:**
- 不实现会话内权限弹窗（已由 `agent-tool-permission` 覆盖）。
- 不在前端写 `perm-*`（不调 `POST /v1/permissions`）。
- 不在前端解析/回写 YAML（注释保留由 agent 负责）。
- 不做规则的导入/导出、批量模板等增强。

## Decisions

### D1：新增 tab + `PermissionsSection` 组件
在 `SettingsModal` 的 `NavItem` 列表追加 `permission`，渲染 `PermissionsSection`。组件内部状态：规则列表（来自 `GET /v1/permissions`）、配置草稿（来自 `GET /v1/permission-config`）、加载/错误/提交态。遵循现有 section 组件的结构与 token 用法。

### D2：读"生效规则"与"配置真源"分离
- 列表展示用 `GET /v1/permissions`：反映 agent 当前真正在 store 中执行的全部规则（preset + manual），是"所见即所执行"的回读。
- 编辑表单的初值用 `GET /v1/permission-config`：反映 config.yaml 文件中的 preset 列表与 default_permission（可编辑真源）。
- 写入用 `PUT /v1/permission-config`，成功后**重新拉取 `GET /v1/permissions`** 刷新列表，让用户看到热加载后的生效结果。manual(`perm-*`) 规则只出现在列表（只读），不进编辑表单。

### D3：IPC 三命令 + 类型镜像
Rust `AgentBridge` 新增三方法，`lib.rs` 注册三个 command，照搬 `list_sessions` 的 HTTP 代理范式：
- `agent_list_permissions` → `GET /v1/permissions`
- `agent_get_permission_config` → `GET /v1/permission-config`
- `agent_set_permission_config` → `PUT /v1/permission-config`

`src/ipc/permissions.ts` 提供类型化包装（Result 模式）与 TS 类型镜像（`PermissionRule`、`PermissionConfig`、`PresetRule`、`PermissionDecision` 联合类型）。

### D4：输入控件与校验
`tool` 用预定义工具列表下拉（Bash/Read/Write/Edit/Grep/... + "所有工具 `*`"），降低输错工具名；`pattern` 文本框带占位示例（如 `git *`、`/tmp/**`）；`decision` 允许/拒绝二选一；`default_permission` 三选一（每次询问/始终允许/始终拒绝）。提交前前端校验 pattern 非空与取值合法，agent PUT 再做白名单兜底（400）。

### D5：错误与并发
所有命令走 Result 模式；agent 不可达 → `transient` 错误 + 重试入口，不崩溃。提交期间禁用表单避免重复 PUT。删除 preset 走既有 `global-confirm-dialog` 二次确认。

## Risks / Trade-offs

- **[依赖 agent 端点尚未落地]** → 本 change apply 前置条件是 agent `hot-reload-permission-config` 已实现；在 agent 端点可用前，前端可先按类型契约开发并用 mock 验证。
- **[manual 规则只读引发困惑]** → 用来源徽章明确标注，并在说明文案中提示 manual 规则为历史 API 创建、本页不管理。
- **[写后回读延迟]** → PUT 成功到热加载对账进 store 有极短延迟；刷新列表可加一次轻量重试/短延时以确保回读到新状态。
- **[远程模式语义]** → 明确读写作用于远端主机 config.yaml，由 agent HTTP 端点保证；前端无需感知路径。

## Migration Plan

纯新增，无数据迁移：
1. 先实现/合入 agent 的 `hot-reload-permission-config`（提供端点）。
2. Rust bridge 三方法 + command 注册。
3. IPC 包装与类型镜像。
4. `PermissionsSection` 组件 + tab 接入 + i18n 文案。
5. 回滚：移除 tab、组件、command 即可，无持久化副作用（真源仍是 config.yaml，可手改）。

## Open Questions

- 预定义工具列表的来源：硬编码常用工具，还是从 agent 能力发现接口动态获取？（暂定硬编码常用集合 + 允许自定义输入）
- 默认策略与具体规则的优先级在 UI 上是否需要可视化提示（deny 优先、default 兜底）。
- 是否在列表中内联展示"某条 manual 规则与某条 preset 冲突"的提示（暂不做，留待后续）。
