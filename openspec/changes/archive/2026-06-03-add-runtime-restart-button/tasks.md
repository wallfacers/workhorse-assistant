## 1. i18n 文案

- [x] 1.1 在 `src/i18n/locales/zh-CN.json` 的 `settings.runtime` 下新增 `applyRestart`: "应用并重启"
- [x] 1.2 在 `src/i18n/locales/en-US.json` 的对应位置同步新增 `applyRestart`: "Apply & Restart"

## 2. UI 按钮

- [x] 2.1 在 `src/components/SettingsModal.tsx` 的 `RuntimeModeSection` 中，于 `advancedHint`（`<p>...advancedHint...</p>`）下方新增一个独立行的按钮，文案 `t('settings.runtime.applyRestart')`
- [x] 2.2 按钮 `onClick` 调用 `void apply(config)`（复用既有本地函数；不受 `overrideDirty` 门控，始终可点）
- [x] 2.3 沿用既有 primary 按钮样式（参考命令框旁按钮的类名），保持与设置区视觉一致

## 3. 验证

- [x] 3.1 `npm run lint` 通过（类型检查门禁）
- [ ] 3.2 手动验证：在配置无变化时点击「应用并重启」，supervisor 状态徽章经历 restarting → healthy，agent 重连成功
- [x] 3.3 确认「保存并重连」按钮的 `overrideDirty` 行为未受影响（命令未改动时仍为灰）
