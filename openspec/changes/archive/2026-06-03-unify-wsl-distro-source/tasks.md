## 1. 暴露 RuntimeConfig 给终端（前端）

- [x] 1.1 终端在 spawn 时直接 `await getRuntimeConfig()` 读取 mode+distro（比独立 hook 更简单、无挂载竞态；替代了对 `useAgentConnection` `/health.distro` 的依赖）
- [x] 1.2 `mode==Wsl` 但 distro 为空时：终端以 undefined distro 提升（wsl.exe 用默认发行版）；真正的硬兜底在 supervisor `drive()`——WSL 模式无 distro 直接 Failed，不会健康

## 2. 终端命名空间改由配置驱动（前端）

- [x] 2.1 `src/components/Terminal.tsx`：`effectiveProfile` 提升条件改为「`cfg?.mode === 'wsl'` + onWindows」
- [x] 2.2 `ptySpawn` 的 `distro` 入参改为 `RuntimeConfig.distro`（`cfg.mode==='wsl' ? cfg.distro : undefined`）
- [x] 2.3 保留 onWindows 宿主门控（`await hostIsWindows()`）不变
- [x] 2.4 更新 `Terminal.tsx` 注释，说明来源已切换为 config、SessionProvider 不再提供 distro

## 3. 对账与配置优先对齐（Rust）

- [x] 3.1 adopt 落定后比较 `RuntimeConfig` 意图与 `/health.distro`：`core::distro_aligned(expected, actual)` 纯函数 + 单测；mod 加 `health_distro()` 抓取
- [x] 3.2 不一致时经 `supervisor://status` 上报「configured=X, actual=Y」（`drift_reason()`，emit `Restarting` + reason）
- [x] 3.3 ✅ 用户决定「可以杀」：Adopt 臂不符时 `capture_pid()` + `reap()` 占用者再按配置重启。**安全边界**：对账仅在 `PortProbe::HealthySidecar`（协议确认的 workhorse-agent）时触发，非 workhorse 仍走 `FailForeign` 不碰；`MAX_RECONCILE_REAPS=3` 防外部 sidecar 反复抢占导致死循环
- [x] 3.4 Native 模式（`expected_distro()==None`）遇到带 `distro` 的 sidecar：`distro_aligned` 判不符 → 同样 reap+按配置重启

## 4. 设置区呈现与对齐引导（前端）

- [x] 4.1 `RuntimeModeSection`：一致不提示；WSL 不符→「配置=X，实际=Y」；WSL 已就绪但无 distro→「无法确认」；Native 却探测到 distro→不符提示
- [x] 4.2 漂移提示文案直接引导点击「应用并重启」对齐（按钮来自已归档 change `add-runtime-restart-button`）
- [x] 4.3 新增 i18n 文案 `driftMismatch` / `driftUnknown`（zh-CN + en-US）

## 5. 验证

- [x] 5.1 OQ3 已核查：`TitleBar.handleOpenProject` 按 `isWslMode` 分支——WSL 走 in-app `ProjectBrowser`（`fsList` → `/v1/fs/list`，agent/WSL 命名空间），Native 走宿主 `pickFolder()` 对话框。无宿主 dialog 泄漏进 WSL 模式，项目目录命名空间已随 mode 一致
- [x] 5.2 `npm run lint` 通过
- [ ] 5.3 WSL 模式 + Windows 宿主：普通 `terminal` 自动开 `wsl.exe -d <配置distro> --cd <项目>`（需 Windows 构建实跑）
- [ ] 5.4 Native 模式 + Windows 宿主：普通 `terminal` 开 pwsh，不提升 wsl（需 Windows 构建实跑）
- [ ] 5.5 模拟漂移（mock /health 返回不同 distro）：Rust 自动 reap+重启对齐 + `supervisor://status` 漂移 reason；设置区提示并可经「应用并重启」对齐（需 Windows 构建实跑）
- [ ] 5.6 非 Windows 宿主（WSL 内跑 dev）：终端开本地 shell，不触发 wsl.exe（onWindows 门控生效）
