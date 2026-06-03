## ADDED Requirements

### Requirement: 单轴三模式选择

「运行来源」面板 SHALL 以单一选择器呈现三种互斥的运行来源:`原生`、`WSL`、`远程`。该选择器取代原先并列的「连接」与「运行时模式」两块。`原生` SHALL 始终可选;`WSL` SHALL 仅在 `wsl_detect().available` 为真时可选;`远程` SHALL 始终可选。

选择某一模式即 SHALL 触发该模式的应用流程(等价于持久化配置并驱动 supervisor / 重连),无需用户额外点击。

#### Scenario: 三模式单轴呈现

- **WHEN** 用户打开「运行来源」面板
- **THEN** 面板 SHALL 呈现 `原生 / WSL / 远程` 单一选择器,且当前模式高亮
- **AND** SHALL NOT 同时存在「连接」与「运行时模式」两个独立区块

#### Scenario: WSL 选项按检测门控

- **WHEN** `wsl_detect().available` 为假
- **THEN** `WSL` 选项 SHALL 不可选(禁用),并呈现不可用原因
- **AND** `原生` 与 `远程` 选项 SHALL 仍可选

### Requirement: 单一派生连接状态

面板 SHALL 仅呈现一个连接状态指示,其值由当前模式派生:本机模式(`原生`/`WSL`)取 `supervisor.status`,远程模式取 `agent.status`(auto-connect 探针)。该派生 SHALL 为纯前端映射,不要求 supervisor 状态机改动。

#### Scenario: 本机模式状态取 supervisor

- **WHEN** 模式为 `原生` 或 `WSL`
- **THEN** 状态指示 SHALL 反映 `supervisor.status`(probing/starting/restarting→启动中,healthy/adopted→运行中,failed→失败,disabled→未启动)

#### Scenario: 远程模式状态取 auto-connect

- **WHEN** 模式为 `远程`
- **THEN** 状态指示 SHALL 反映 `agent.status`(connecting→连接中,connected→运行中,error→连接失败,idle→未连接)
- **AND** SHALL NOT 呈现第二个独立状态点

### Requirement: 单一「应用」动作

面板 SHALL 仅提供一个「应用」动作,取代原「保存并重连」与「应用并重启」两个按钮。其行为随模式而定:本机模式 SHALL 以当前配置重新驱动 supervisor(回收当前 sidecar 后按配置重启)并触发重连;远程模式 SHALL 仅触发重连探针(无进程生命周期)。该动作 SHALL 始终可点击,不受字段是否被改动(dirty)门控。

#### Scenario: 本机模式应用即重启

- **WHEN** 模式为 `原生`/`WSL`,用户点击「应用」
- **THEN** 系统 SHALL 以当前 `RuntimeConfig` 重新驱动 supervisor 并触发渲染层重连

#### Scenario: 远程模式应用即重连

- **WHEN** 模式为 `远程`,用户点击「应用」
- **THEN** 系统 SHALL 触发 auto-connect 重新探针,SHALL NOT 尝试 spawn 任何进程

### Requirement: 字段按模式分流

面板的次级字段 SHALL 仅在与当前模式相关时呈现:`发行版`下拉 SHALL 仅在 `WSL` 模式呈现;`启动命令(高级)` SHALL 仅在 `原生`/`WSL` 模式呈现;`服务地址(endpoint)`整串编辑 SHALL 仅在 `远程` 模式呈现。配置/实际运行态的发行版漂移提示 SHALL 仅在 `WSL` 模式相关时呈现。

#### Scenario: 远程模式隐藏托管字段

- **WHEN** 模式为 `远程`
- **THEN** 面板 SHALL 隐藏 `发行版` 与 `启动命令(高级)`
- **AND** SHALL 呈现可编辑的 `服务地址` 字段

#### Scenario: 本机模式隐藏远程地址编辑

- **WHEN** 模式为 `原生`/`WSL`
- **THEN** 面板 SHALL NOT 呈现远程整串地址编辑
- **AND** `WSL` 模式 SHALL 额外呈现 `发行版` 下拉

### Requirement: endpoint 可编辑性按模式分流

本机模式(`原生`/`WSL`)下,`endpoint` 的 host SHALL 锁定为 loopback(`127.0.0.1`),仅端口对用户可调(作为高级字段),因为 supervisor 恒将 sidecar 绑定在 loopback。远程模式下 `endpoint` 整串 SHALL 对用户可编辑(允许非 loopback host)。

#### Scenario: 本机模式仅端口可调

- **WHEN** 模式为 `原生`/`WSL`,用户编辑地址
- **THEN** host 部分 SHALL 固定为 `127.0.0.1`,仅端口可被修改
- **AND** 该端口 SHALL 成为 supervisor 拉起 sidecar 所用端口(端口单一真相)

#### Scenario: 远程模式整串可编辑

- **WHEN** 模式为 `远程`
- **THEN** 用户 SHALL 可填写任意 `http(s)://host[:port]` 作为远程 agent 地址

### Requirement: 远程连接限制提示

远程模式 SHALL 呈现一行说明,告知用户:远程 agent 须在其自身配置中放行本应用的 Origin,且本次范围**不支持已启用鉴权(Bearer token)的远程 agent**。该提示 SHALL 不阻断用户填写地址。

#### Scenario: 远程模式呈现限制提示

- **WHEN** 模式为 `远程`
- **THEN** 面板 SHALL 呈现关于 Origin 放行与"不支持鉴权 agent"的说明文案
