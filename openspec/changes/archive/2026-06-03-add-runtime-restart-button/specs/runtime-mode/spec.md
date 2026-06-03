## ADDED Requirements

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
