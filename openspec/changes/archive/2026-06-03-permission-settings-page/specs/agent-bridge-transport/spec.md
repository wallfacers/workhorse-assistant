## ADDED Requirements

### Requirement: 权限规则与配置的 Rust 代理命令

Rust bridge SHALL 暴露 Tauri command，把权限规则的读取与权限配置的读/写代理到 agent 端点；渲染层 SHALL 仅通过这些 command 访问，SHALL NOT 直接发起到 sidecar 的网络请求。

- 读取生效规则：代理 `GET /v1/permissions`，返回规则数组（含 `tool`/`pattern`/`decision`/来源）。
- 读取配置真源：代理 `GET /v1/permission-config`，返回 `default_permission` 与 `preset_rules`。
- 写入配置真源：代理 `PUT /v1/permission-config`，提交 `default_permission` 与 `preset_rules`。

所有 command SHALL 沿用既有错误约定，返回 `{ok:true,...}` 或 `{ok:false, error:{kind,message}}`，并在 agent 不可达时返回 `transient` 错误而不崩溃。command 的入参/返回类型 SHALL 在 `src/ipc` 有对应 TypeScript 类型镜像。

#### Scenario: 渲染层经命令读取规则

- **WHEN** 权限设置页需要展示规则
- **THEN** 渲染层 SHALL 调用对应 Tauri command，由 Rust 代理 `GET /v1/permissions` 取回数据
- **AND** 渲染层不向 `127.0.0.1` 发起 `fetch`/`EventSource`

#### Scenario: 写入配置经命令代理到 PUT

- **WHEN** 渲染层提交新的权限配置
- **THEN** Rust bridge SHALL 调用 agent 的 `PUT /v1/permission-config` 并把结果以 `{ok}` 形式回传

#### Scenario: agent 不可达返回 transient

- **WHEN** 代理调用时 agent 端点不可达
- **THEN** command SHALL 返回 `{ok:false, error:{kind:"transient", message}}`，应用不崩溃
