## Why

最终目标：**运行时模式（`RuntimeConfig`）是单一权威，所有命名空间敏感的行为都跟着它走且保持同步。**

- **WSL 模式（打包分发）**：`workhorse-assistant` 前端跑在 Windows，`workhorse-agent` 后端部署在 WSL 用户目录。则打开的项目目录、打开的终端，**全部**应在该 WSL 发行版内。
- **Native（默认 Windows）模式**：agent、项目、终端**全部**在 Windows。

当前问题：「用哪个发行版 / 是否进 WSL」对终端而言取的是**另一个来源**——`/health.distro`（sidecar 自报），而非用户在设置里选的 `RuntimeConfig`。两个来源平时靠「Supervisor 用配置启动 agent、agent 自报同一发行版」碰巧一致，但：

- 它们之间**无强制同步**，adopt 残留 sidecar、改配置未重启的窗口期等情形会**静默漂移**；
- 终端的 WSL 决策依赖 sidecar「恰好自报了 distro」，而不是用户的明确意图。

这与「配置优先」的目标相悖。本 change **推翻** 既有「终端以 `/health.distro` 为准」的设计，改为 **`RuntimeConfig` 驱动终端命名空间**，`/health.distro` 降为**校验/检测漂移**之用。

> 已核实：`workhorse-agent` 的 `/health` **已正确上报 `distro`**（`internal/api/health.go::getDistro()`，源自 `$WSL_DISTRO_NAME` 注册名，非 WSL 时不带该字段）。因此**无需修改 agent**——它上报的值正好可用于校验。

## What Changes

- **终端 WSL 决策改由 `RuntimeConfig` 驱动**：`terminal`→`wsl` 的自动提升条件从「`/health.distro` 非空 + onWindows」改为「`RuntimeConfig.mode == Wsl` + onWindows」，且 `wsl.exe -d <distro>` 的 distro 取自 **`RuntimeConfig.distro`**，不再取 `/health.distro`。**BREAKING**（行为层面，对既有 `wsl-remote` 规范）。
- **保留 onWindows 宿主门控**：`wsl.exe` 仍只在宿主为 Windows 时启动（Rust PTY 层权威 + 渲染层双保险），这条不变。
- **`/health.distro` 降为校验信号**：Supervisor spawn/adopt 落定后，比较 `RuntimeConfig.distro` 与 `/health.distro`；不一致即视为漂移，经 `supervisor://status` 上报。WSL 模式下 adopt 到发行版不符的 sidecar 时，SHALL 倾向 reap + 按配置重启（**配置优先**），而非将就实际值。
- **Native 模式拒绝 WSL sidecar**：Native 模式下若端口上的 sidecar `/health` 带 `distro`（即是个 WSL sidecar），系统 SHALL 视为与配置矛盾并上报，而非采用。
- **设置区如实呈现**：一致时显示配置发行版；漂移/未对齐时显式提示，并引导用户用「应用并重启」对齐（依赖 change `add-runtime-restart-button`）。
- **agent 侧**：经核实无需改动；若后续验证发现 distro 上报有缺口，再回 `../workhorse-agent` 修补（已确认改点在 `internal/api/health.go`）。

## Capabilities

### New Capabilities
<!-- 无新增能力 -->

### Modified Capabilities
- `wsl-remote`: 修改「WSL terminal bridge only on a Windows host」需求——distro 来源由 `/health.distro` 改为 `RuntimeConfig`；新增「配置 distro 与实际 distro 校验/漂移上报」需求。
- `runtime-mode`: 新增设置区呈现实际/漂移的需求，明确配置优先与一键对齐。

## Impact

- `src/components/Terminal.tsx`：`effectiveProfile` 提升条件改读 `RuntimeConfig`（经新的 IPC/上下文暴露 mode+distro），`ptySpawn` 的 distro 参数改为配置值。
- `src/session/` 或新增上下文：把 `RuntimeConfig`（mode+distro）暴露给终端，替代 `useAgentConnection` 的 `/health.distro`。
- `src-tauri/src/runtime/`：spawn/adopt 落定后对账，漂移经 `supervisor://status` 上报；Native 模式拒绝带 distro 的 sidecar；WSL adopt 不符时倾向 reap+重启。
- `src-tauri/src/pty/`：`wsl` profile 的 distro 入参来源（确认仍由调用方传入，逻辑不变）。
- `src/components/SettingsModal.tsx`：呈现实际/漂移 + 引导对齐。
- 外部 `workhorse-agent`：经核实**无需改动**（`/health` 已上报注册名 distro）。
