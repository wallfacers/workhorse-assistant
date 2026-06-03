## Context

`RuntimeModeSection`（`src/components/SettingsModal.tsx`）已经把「写配置 + 重启 supervisor + 重连」收敛到一个本地 `apply(next: RuntimeConfig)` 函数里：它调用 `setRuntimeConfig(next)`，成功后按需 `resetProjectForRuntimeSwitch()` 并 `onReconnect()`。后端 `set_runtime_config` 命令（`src-tauri/src/lib.rs`）会调用 `supervisor.drive()` 完成 teardown + 重新 spawn。

现有三个触发 `apply` 的入口（切模式、换发行版、保存命令）都隐含「配置发生了变化」这一前提：
- `selectMode` / `changeDistro` 仅在选择变化时触发；
- 命令框旁的「保存并重连」按钮 `disabled={!overrideDirty}`，命令未改动时为灰。

因此「配置无变化、只想原地重启」没有 UI 入口。

## Goals / Non-Goals

**Goals:**
- 在运行时设置区提供一个始终可点的「应用并重启」按钮，复用既有 `apply(config)` 路径。
- 不引入任何后端或 IPC 变更。

**Non-Goals:**
- 不改动「保存并重连」按钮的 `overrideDirty` 语义。
- 不触碰终端/WSL distro 的来源问题（由独立 change `unify-wsl-distro-source` 处理）。
- 不新增 supervisor 状态机或重启节流逻辑。

## Decisions

- **复用 `apply(config)` 而非新增 IPC**：点击直接 `void apply(config)`。`setRuntimeConfig` 用相同配置再写一次是幂等的，后端 `supervisor.drive()` 无条件 teardown + 重新 spawn，正好满足「强制重启」语义。备选方案是新增专用 `restart` 命令，但会平白增加一条后端路径，且 `drive()` 已具备幂等重启能力，故不取。
- **按钮独立于命令框**：放在 `advancedHint` 文案下方单独一行，不复用命令框旁按钮，避免把「重启」与「保存自定义命令」两个语义耦合在同一个受 `overrideDirty` 门控的控件上。
- **不做二次确认**：重启是非破坏性的本地操作（仅回收并重启本系统自启的 sidecar，归属保护由后端既有逻辑兜底），无需弹窗确认。
- **i18n**：新增 `settings.runtime.applyRestart`，zh-CN 为「应用并重启」，其余 locale 同步补齐占位/翻译，遵循仓库既有 locale 同步约定。

## Risks / Trade-offs

- [连点导致连续 teardown/spawn] → 后端 `drive()` 内部以 runtime mutex 串行化（先 teardown 再 drive），连点最多排队重启，不会并发串台；如体感需要可在按钮上加 `disabled` 短时态，但本 change 不强制。
- [用户混淆两个按钮] → 通过文案区分（「保存并重连」vs「应用并重启」）与位置分离（命令框旁 vs hint 下方）降低混淆；后续可在 hint 中补一句说明。

## Open Questions

- 无。实现路径明确，等待按钮的视觉细节（沿用既有 primary 按钮样式即可）。
