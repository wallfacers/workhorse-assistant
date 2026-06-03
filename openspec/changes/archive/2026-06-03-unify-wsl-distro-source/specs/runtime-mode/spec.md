## ADDED Requirements

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
