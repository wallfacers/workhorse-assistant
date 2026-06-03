## MODIFIED Requirements

### Requirement: 运行时模式选择

系统 SHALL 持久化一个运行时模式 `RuntimeMode`,取值为 `Native`、`Wsl{distro}` 或 `Remote`,默认且兜底为 `Native`。`Remote` 表示连接到一个已在外部运行的 agent(由用户提供 `endpoint`),系统不在本机托管该 agent 进程。`RuntimeConfig` SHALL NOT 再携带独立的 `port` 字段(端口改由 `endpoint` 推导,见「端口单一真相」需求)。

#### Scenario: 首次启动默认 Native

- **WHEN** app 首次启动,配置文件中无运行时模式字段(或字段缺失)
- **THEN** 系统 SHALL 采用 `RuntimeMode::Native`
- **AND** SHALL 在 host 上托管 Native sidecar,不接触 WSL

#### Scenario: 运行来源选择器呈现三模式

- **WHEN** 用户在 Settings 查看运行来源选择器
- **THEN** `Native` 选项 SHALL 始终可选
- **AND** `WSL` 选项 SHALL 仅在 `wsl_detect().available` 为真时可选,并列出可用发行版
- **AND** `Remote` 选项 SHALL 始终可选

### Requirement: 运行时互斥

系统 SHALL 保证同一时刻只有一种运行时占用 agent 端口。切换到本机运行时(`Native`/`Wsl`)时,系统 SHALL 先回收当前模式自启的 sidecar 并确认端口释放,再启动目标模式的 sidecar。切换到 `Remote` 时,系统 SHALL 先回收当前本机模式自启的 sidecar(若有),但 SHALL NOT 在本机启动任何 sidecar。

#### Scenario: 从 WSL 切到 Native

- **WHEN** 当前为 `Wsl` 模式且其 sidecar 由本系统启动,用户切换到 `Native`
- **THEN** 系统 SHALL 先 reap WSL sidecar
- **AND** 确认端口释放后 SHALL 启动 Native sidecar
- **AND** 最终 `/health` 的 `distro` SHALL 为空

#### Scenario: 切换不串台到残留 sidecar

- **WHEN** 切换运行时后目标端口仍被上一模式的残留进程应答
- **THEN** 系统 SHALL NOT 把残留 sidecar 当作目标运行时采用
- **AND** SHALL 在端口真正释放后才视为切换成功

#### Scenario: 从本机切到 Remote 回收自启 sidecar

- **WHEN** 当前为 `Native`/`Wsl` 模式且 sidecar 由本系统启动,用户切换到 `Remote`
- **THEN** 系统 SHALL reap 该自启 sidecar
- **AND** SHALL NOT 在本机启动任何新 sidecar

## ADDED Requirements

### Requirement: 远程运行时模式 — supervisor 不参与

在 `Remote` 模式下,supervisor SHALL 进入 `Disabled` 状态并立即返回:SHALL NOT spawn、reap、轮询或以任何方式参与进程生命周期。远程 agent 的存活性 SHALL 完全由渲染层的 auto-connect 探针(`agent.status`)负责。该设计(R2)避免把"无本机进程"的远程场景塞进进程监督器,从而无需为 supervisor 状态机新增状态或在通用 monitor 循环中开特例。

> 取舍记录:备选方案 R1(为远程实现一个只探针、不 spawn 的 Backend 走 supervisor 状态机)被否决——它要么在 adopt 后立即退出、把存活性交回 auto-connect(等价于 R2 却多写一个空壳 Backend),要么需新增非终态轮询状态并与 auto-connect 重复探测同一 `/health`,且会被既有 distro 对齐逻辑误杀远程 WSL agent。

#### Scenario: 远程模式下 supervisor 禁用

- **WHEN** 运行时模式为 `Remote`,系统驱动 supervisor
- **THEN** supervisor SHALL 经 `supervisor://status` 报告 `Disabled`(可带 `runtime: "remote"` 标签)
- **AND** SHALL NOT spawn 任何进程,SHALL NOT 对端口占用者做 reap

#### Scenario: 远程存活性由 auto-connect 负责

- **WHEN** 远程 agent 短暂不可达后恢复
- **THEN** auto-connect 探针 SHALL 按既有退避自动重连并将 `agent.status` 标为 connected
- **AND** supervisor SHALL NOT 因此进入 `Failed` 或尝试重启

### Requirement: 端口单一真相

agent 端口 SHALL 只有一个权威来源:`AppConfig.endpoint`。系统 SHALL 移除 `RuntimeConfig.port` 字段。本机模式(`Native`/`Wsl`)下,supervisor 拉起 sidecar 所用的端口 SHALL 从当前 `endpoint` 解析得到,而非独立的 `port` 字段。读取旧版配置时,系统 SHALL 忽略遗留的 `runtime.port` 字段(以 `endpoint` 为准),不产生破坏性迁移。

#### Scenario: 本机端口从 endpoint 推导

- **WHEN** 模式为 `Native`/`Wsl`,`endpoint = http://127.0.0.1:9000`
- **THEN** supervisor SHALL 以端口 `9000` 拉起 sidecar(`serve --host 127.0.0.1 --port 9000`)
- **AND** 系统 SHALL NOT 依赖任何独立的 `runtime.port` 值

#### Scenario: 旧配置的遗留 port 字段被忽略

- **WHEN** 读取到旧版 config.json 含 `runtime.port = 8000` 而 `endpoint = http://127.0.0.1:7821`
- **THEN** 系统 SHALL 以 `endpoint` 的端口 `7821` 为准
- **AND** SHALL NOT 因遗留 `port` 字段报错或拒绝加载
