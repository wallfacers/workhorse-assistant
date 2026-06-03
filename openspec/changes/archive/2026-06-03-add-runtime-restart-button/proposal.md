## Why

运行时设置区里唯一能触发 supervisor 重启的可点控件是命令框旁的「保存并重连」按钮，但它 `disabled={!overrideDirty}`——只有改动了高级启动命令才会亮。当用户想在**不修改任何配置**的前提下手动重启 agent（例如 sidecar 卡死、想强制重新 spawn），现有 UI 没有入口：模式/发行版没变就不触发 `apply`，命令框留空按钮也是灰的。用户只能退出整个 app 或绕道改一下配置再改回来。

## What Changes

- 在 `RuntimeModeSection` 的 `advancedHint`（"留空使用约定默认…"）文案**下方**新增一个独立的「应用并重启」按钮。
- 该按钮**不受 `overrideDirty` 门控**，无论配置是否变化都可点击；点击即以当前 `RuntimeConfig` 调用 `apply(config)` → `setRuntimeConfig` → `supervisor.drive()`（teardown 当前 sidecar 后重新 spawn）。
- 新增 i18n 文案键 `settings.runtime.applyRestart`（zh-CN 为「应用并重启」），并同步补齐其它 locale 文件。
- 纯前端改动，不改动 Rust 后端：复用既有的 `setRuntimeConfig` 命令与 `supervisor.drive()` 重启路径。

## Capabilities

### New Capabilities
<!-- 无新增能力 -->

### Modified Capabilities
- `runtime-mode`: 新增一条需求，规定运行时设置区 SHALL 提供一个不依赖配置变更的手动重启控件，触发当前模式 sidecar 的回收与重新启动。

## Impact

- `src/components/SettingsModal.tsx`（`RuntimeModeSection`）：新增按钮与点击处理。
- `src/i18n/locales/zh-CN.json` 及其它 locale：新增 `settings.runtime.applyRestart`。
- 复用现有 IPC `setRuntimeConfig` 与后端 `supervisor.drive()`，无后端代码或协议变更。
