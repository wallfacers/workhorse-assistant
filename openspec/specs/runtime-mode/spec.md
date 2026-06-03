# runtime-mode Specification

## Purpose
TBD - created by archiving change add-native-runtime-mode. Update Purpose after archive.
## Requirements
### Requirement: 运行时模式选择

系统 SHALL 持久化一个运行时模式 `RuntimeMode`,取值为 `Native` 或 `Wsl{distro}`,默认且兜底为 `Native`。该模式取代原 `WslConfig.managed: bool`。

#### Scenario: 首次启动默认 Native

- **WHEN** app 首次启动,配置文件中无运行时模式字段(或字段缺失)
- **THEN** 系统 SHALL 采用 `RuntimeMode::Native`
- **AND** SHALL 在 host 上托管 Native sidecar,不接触 WSL

#### Scenario: WSL 模式按检测门控

- **WHEN** 用户在 Settings 查看运行时模式选择器
- **THEN** `Native` 选项 SHALL 始终可选
- **AND** `WSL` 选项 SHALL 仅在 `wsl_detect().available` 为真时可选,并列出可用发行版

### Requirement: Native sidecar 托管

在 `Native` 模式下,系统 SHALL 启动随 app 打包的 `workhorse-agent` 二进制(`serve --host 127.0.0.1 --port <port>`,cwd 为 host 路径),并在 app 退出或切换运行时时回收它。

#### Scenario: Native 模式启动 sidecar

- **WHEN** 运行时模式为 `Native` 且端口空闲
- **THEN** 系统 SHALL 在 host 上 spawn 打包的 `workhorse-agent` 二进制
- **AND** `/health` 返回的 `default_workdir` SHALL 为 host 路径(非 WSL 命名空间)
- **AND** `/health` 返回的 `distro` SHALL 为空

#### Scenario: 退出时回收自启的 sidecar

- **WHEN** app 退出或用户切走 `Native` 模式,且当前 sidecar 是系统自己启动的
- **THEN** 系统 SHALL 回收该 sidecar 进程(SIGTERM 宽限后 SIGKILL)

#### Scenario: 不接管无法确认归属的进程

- **WHEN** 目标端口被一个无法经 cmdline 确认为本系统所启的进程占用
- **THEN** 系统 SHALL NOT 杀该进程
- **AND** SHALL 经 `supervisor://status` 报告冲突,提示用户

### Requirement: 运行时互斥

系统 SHALL 保证同一时刻只有一种运行时占用 agent 端口。切换运行时模式时,系统 SHALL 先回收当前模式的 sidecar 并确认端口释放,再启动目标模式的 sidecar。

#### Scenario: 从 WSL 切到 Native

- **WHEN** 当前为 `Wsl` 模式且其 sidecar 由本系统启动,用户切换到 `Native`
- **THEN** 系统 SHALL 先 reap WSL sidecar
- **AND** 确认端口释放后 SHALL 启动 Native sidecar
- **AND** 最终 `/health` 的 `distro` SHALL 为空

#### Scenario: 切换不串台到残留 sidecar

- **WHEN** 切换运行时后目标端口仍被上一模式的残留进程应答
- **THEN** 系统 SHALL NOT 把残留 sidecar 当作目标运行时采用
- **AND** SHALL 在端口真正释放后才视为切换成功

### Requirement: 切换运行时清理跨命名空间状态

切换运行时模式后,系统 SHALL 触发渲染层重连,并清除当前项目记忆与在途会话,避免把用户带到错误命名空间的路径。

#### Scenario: 切换后重连并清项目记忆

- **WHEN** 用户切换运行时模式
- **THEN** 渲染层 SHALL 重新探测 `/health`(reconnect)
- **AND** SHALL 清空 `localStorage['workhorse:currentProject']` 与在途 live sessions

#### Scenario: 默认项目跨命名空间时不自动打开

- **WHEN** `/health` 的 `default_workdir` 与当前 host 运行时命名空间不符(如 Native 模式下收到 WSL 路径)
- **THEN** 系统 SHALL NOT 自动 `openProject(default_workdir)`
- **AND** SHALL 引导用户经 picker 选择项目

### Requirement: 原生二进制打包

系统 SHALL 将 `workhorse-agent` 的 Windows 构建作为 Tauri `externalBin` sidecar 随 app 分发,供 Native supervisor 定位与启动。

#### Scenario: 打包包含原生二进制

- **WHEN** 为 Windows target 构建 app
- **THEN** 产物 SHALL 包含按 target triple 命名的 `workhorse-agent` 可执行文件
- **AND** Native supervisor SHALL 能经 Tauri sidecar 路径解析定位它

### Requirement: 手动重启运行时

运行时设置区 SHALL 提供一个**不依赖配置变更**的手动重启控件。触发该控件时，系统 SHALL 以当前持久化的 `RuntimeConfig` 重新驱动 supervisor（回收当前 sidecar 后重新启动），即使模式、发行版与启动命令均未发生变化。

该控件 SHALL 独立于命令框旁的「保存并重连」按钮——后者仅在高级启动命令被改动（dirty）时可用，不能覆盖「配置无变化时仍需重启」的场景。

#### Scenario: 配置无变化时仍可重启

- **WHEN** 用户未改动运行时模式、发行版或高级启动命令，点击「应用并重启」控件
- **THEN** 系统 SHALL 以当前 `RuntimeConfig` 重新驱动 supervisor
- **AND** SHALL 先回收当前模式的 sidecar 并确认端口释放，再以同一配置重新启动 sidecar
- **AND** 渲染层 SHALL 重新探测 `/health`（reconnect）

#### Scenario: 重启控件始终可点

- **WHEN** 用户查看运行时设置区
- **THEN** 「应用并重启」控件 SHALL 始终可点击，不受高级启动命令是否被改动（`overrideDirty`）的门控

#### Scenario: 重启沿用既有互斥与归属保护

- **WHEN** 用户触发手动重启，而当前端口被一个无法确认为本系统所启的进程占用
- **THEN** 系统 SHALL NOT 杀该进程
- **AND** SHALL 沿用既有运行时互斥与 `supervisor://status` 报告路径，不因手动重启而绕过归属保护

### Requirement: 设置区呈现实际运行态并支持一键对齐

运行时设置区 SHALL 以 `RuntimeConfig`（用户配置）为权威呈现当前运行时模式与发行版。当 `/health` 校验显示实际运行态与配置一致时，呈现单一发行版即可。当实际与配置不一致（adopt 漂移、改配置未重启的窗口期）或实际值无法确认时，设置区 SHALL 显式提示该不一致，并引导用户用「应用并重启」按配置重新对齐（见 change `add-runtime-restart-button`）。

> 配置优先：设置区呈现的「目标」始终是用户配置；漂移提示的作用是让用户察觉「实际尚未对齐」，解决手段是按配置重启对齐，而非接受实际值改写配置。

#### Scenario: 配置与实际一致

- **WHEN** `RuntimeConfig.distro = "Ubuntu"` 且 `/health.distro = "Ubuntu"`
- **THEN** 设置区 SHALL 呈现 `Ubuntu` 为当前发行版，不显示漂移提示

#### Scenario: 实际未对齐配置时提示并引导对齐

- **WHEN** `RuntimeConfig.distro = "Ubuntu"` 而 `/health.distro = "Debian"`（或 Native 配置下却探测到 WSL sidecar）
- **THEN** 设置区 SHALL 提示「配置为 Ubuntu，实际运行为 Debian，尚未对齐」
- **AND** SHALL 引导用户点击「应用并重启」以按配置重新启动 sidecar

#### Scenario: 实际值无法确认时提示

- **WHEN** 模式为 `Wsl` 但 `/health` 未上报 `distro`（sidecar 未就绪或探测失败）
- **THEN** 设置区 SHALL 提示「无法确认实际运行发行版」，而非默认显示配置值为已生效

