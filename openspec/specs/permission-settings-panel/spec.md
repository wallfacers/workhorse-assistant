# permission-settings-panel Specification

## Purpose
TBD - created by archiving change permission-settings-page. Update Purpose after archive.
## Requirements
### Requirement: 权限设置 tab 入口

`SettingsModal` SHALL 在导航中新增「权限」一项，置于现有「智能体」之后、「会话」前后位置不限。选中后 SHALL 渲染 `PermissionsSection`。该 tab 的所有可见文案 SHALL 取自 i18n（`zh-CN`/`en-US` 配对键），SHALL NOT 硬编码中文或英文字面量；样式 SHALL 使用既有 Tailwind 设计 token，SHALL NOT 出现硬编码十六进制色值。

#### Scenario: 导航出现权限 tab

- **WHEN** 用户打开设置弹窗
- **THEN** 导航 SHALL 含「权限」一项，点击后展示权限规则管理界面

#### Scenario: 文案随语言切换

- **WHEN** 当前语言为 `en-US`
- **THEN** 权限 tab 的标题、按钮、列头 SHALL 显示英文，由 i18n 提供

### Requirement: 展示当前生效的权限规则

`PermissionsSection` SHALL 通过 Rust bridge 命令调用 agent 的 `GET /v1/permissions`，展示当前真正在执行的全部永久规则，每条至少呈现 `tool`、`pattern`、`decision` 与来源（`preset` / `manual`）。`allow_permanent` 与 `deny_permanent` SHALL 以可区分的视觉标识（如绿色/红色色标）呈现。来源为 `manual` 的规则 SHALL 标注来源徽章且 SHALL 以只读方式展示（不提供本页编辑/删除入口）。

加载失败或 agent 不可达时 SHALL 呈现错误态并允许重试，SHALL NOT 使弹窗崩溃。

#### Scenario: 列出 preset 与 manual 规则

- **WHEN** agent 返回一条 `preset` 来源的 allow 规则与一条 `manual` 来源的 deny 规则
- **THEN** 列表 SHALL 各显示一行，分别带 allow/deny 色标与 preset/manual 来源徽章

#### Scenario: agent 不可达时的错误态

- **WHEN** 调用 `GET /v1/permissions` 失败
- **THEN** SHALL 显示错误提示与重试入口，弹窗其余部分仍可用

### Requirement: 编辑权限规则写入 config.yaml 真源

新增、删除、修改 preset 规则与切换 `default_permission`，SHALL 通过 Rust bridge 命令读写 agent 的 `GET`/`PUT /v1/permission-config`（即 `config.yaml` 的 `tools` 段），作为唯一写入真源。该界面 SHALL NOT 调用 `POST /v1/permissions` 写入 `perm-*` 规则。

添加/编辑规则时：`tool` SHALL 以预定义工具列表下拉选择（含"所有工具 `*`"），`pattern` SHALL 为带占位示例的文本输入，`decision` SHALL 为「允许 / 拒绝」二选一（分别对应 `allow_permanent` / `deny_permanent`）。`default_permission` SHALL 以「每次询问（空）/ 始终允许 / 始终拒绝」三选一呈现。

提交前 SHALL 做前端校验：`pattern` 非空、`decision`/`default_permission` 取值合法；非法时 SHALL 阻止提交并就地提示。写入成功后 SHALL 重新拉取 `GET /v1/permissions` 刷新列表以回读生效状态。

#### Scenario: 新增一条 deny 规则

- **WHEN** 用户选择 `tool=Read`、填写 `pattern=/etc/**`、选择「拒绝」并提交
- **THEN** 前端 SHALL 经 `PUT /v1/permission-config` 把该规则写入 `config.yaml` 的 `preset_rules`，成功后刷新列表

#### Scenario: 删除 preset 规则

- **WHEN** 用户对一条 `preset` 规则点击删除并确认
- **THEN** 前端 SHALL 经 `PUT /v1/permission-config` 提交移除该条后的 `preset_rules`，列表刷新后不再含该规则

#### Scenario: 切换默认策略

- **WHEN** 用户将默认策略由「每次询问」改为「始终拒绝」
- **THEN** 前端 SHALL 经 `PUT /v1/permission-config` 写入 `default_permission=deny_permanent`

#### Scenario: 非法输入被拦截

- **WHEN** 用户提交时 `pattern` 为空
- **THEN** SHALL 阻止提交并就地提示 `pattern` 不能为空，不发起写入

#### Scenario: 不写 perm-* 真源唯一

- **WHEN** 用户在本页完成任意增删改
- **THEN** 写入 SHALL 仅经 `/v1/permission-config`（config.yaml），SHALL NOT 产生对 `POST /v1/permissions` 的调用

### Requirement: 三运行模式行为一致

native、WSL、远程三种运行模式下，权限规则的读写 SHALL 统一经 agent HTTP 端点完成，行为一致。远程模式下读写 SHALL 作用于远端 agent 主机的 `config.yaml`。

#### Scenario: 远程模式作用于远端真源

- **WHEN** 当前运行模式为「远程」，用户新增一条规则
- **THEN** 写入 SHALL 经远端 agent 的 `/v1/permission-config` 落到远端主机的 `config.yaml`

