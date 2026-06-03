## Why

目前 workhorse-agent 的永久权限规则（`tools.preset_rules`）与默认策略（`tools.default_permission`）只能通过手改 `~/.workhorse-agent/config.yaml` 或 agent CLI 管理；workhorse-assistant 用户无法在界面里查看与配置这些"哪些工具/路径/命令被永久允许或拒绝"的规则。`agent-tool-permission` 能力只覆盖**会话进行中**的临时弹窗，不覆盖**永久规则的预先配置**。

本 change 在设置页新增「权限」tab，让用户以页面交互方式查看与编辑永久权限规则，配置即永久生效、跨会话保留。

## What Changes

- **设置页新增「权限」tab**：在 `SettingsModal` 现有导航（主题/快捷键/智能体/会话）后追加「权限」一项。
- **规则列表**：调用 agent 的 `GET /v1/permissions` 展示**当前真正在执行**的全部永久规则，按 `tool` / `pattern` / `decision` 呈现，allow/deny 用色标区分，并以来源徽章标出 `preset`（来自 config.yaml）与 `manual`（历史经 API 创建的 `perm-*`，只读展示）。
- **编辑规则（写真源 config.yaml）**：新增/删除/修改规则与切换 `default_permission`（每次询问 / 始终允许 / 始终拒绝），均通过 agent 的 `GET`/`PUT /v1/permission-config` 端点读写 `config.yaml` 的 `tools` 段；写入后由 agent 热加载使其下个 loop 生效，无需重启。
- **单一真源**：设置页**只写 `config.yaml`**（经 `/v1/permission-config`），**不调用 `POST /v1/permissions`** 写 `perm-*`；`GET /v1/permissions` 仅用于回读已生效规则。
- **输入辅助**：`tool` 用预定义工具列表下拉（含"所有工具 `*`"），`pattern` 用带占位示例的文本输入，`decision` 为允许/拒绝二选一；提交前做前端校验。
- **三模式一致**：native / WSL / 远程模式下，因读写统一走 agent HTTP 端点，行为一致；远程模式作用于远端主机的 `config.yaml`。
- **渲染层零直连**：所有读写经 Rust bridge 新增的 Tauri command 代理到 agent 端点，渲染层不发起网络请求（遵循现有 IPC 约定）。
- **i18n**：所有文案进 `zh-CN.json` / `en-US.json` 配对；样式用 Tailwind 设计 token，无硬编码色值。

## Capabilities

### New Capabilities
- `permission-settings-panel`: 设置页「权限」tab——列出、新增、删除、修改永久权限规则与默认策略，经 agent 端点读写 config.yaml 真源并回读生效状态。

### Modified Capabilities
- `agent-bridge-transport`: 新增 Rust bridge 方法与 Tauri command，将权限规则读/写代理到 agent 的 `/v1/permissions`（读）与 `/v1/permission-config`（读/写）端点。

## Impact

- **前端**：`src/components/SettingsModal.tsx`（新增 tab 与 `PermissionsSection` 组件）、`src/ipc/`（新增类型化 IPC 包装与 TS 类型镜像）、`src/i18n/locales/{zh-CN,en-US}.json`。
- **Rust**：`src-tauri/src/agent/mod.rs`（新增 `list_permissions` / `get_permission_config` / `put_permission_config` bridge 方法）、`src-tauri/src/lib.rs`（注册对应 Tauri command）。
- **依赖**：本 change 依赖 workhorse-agent 的 `hot-reload-permission-config` change 提供 `GET/PUT /v1/permission-config` 端点，须先行落地。
- **API**：消费 agent 既有 `GET /v1/permissions` 与新增 `GET/PUT /v1/permission-config`。
