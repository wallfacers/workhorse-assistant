## 1. Rust 数据模型(端口收敛 + Remote 模式)

- [x] 1.1 `config/mod.rs`:`RuntimeKind` 新增 `Remote` 变体(serde `"remote"`);确认未知变体反序列化优雅兜底为 `Native`(必要时加 `#[serde(other)]` 或自定义 default)
- [x] 1.2 `config/mod.rs`:从 `RuntimeConfig` 删除 `port: u16` 字段及 `Default` 中的 `port`
- [x] 1.3 `config/mod.rs`:补单测——旧版 config(含 `runtime.port`)反序列化成功且字段被忽略,以 `endpoint` 为准
- [x] 1.4 `runtime/core.rs` 或 `agent/mod.rs`:新增/复用 `endpoint` → 端口解析 helper(供 supervisor 拉起用),含无端口时的默认兜底
- [x] 1.5 `agent/mod.rs`:`set_endpoint` 增加端口可解析校验,错误信息提示期望形式 `http(s)://host[:port]`

## 2. Rust supervisor 驱动(R2:Remote = Disabled)

- [x] 2.1 `runtime/mod.rs`:`drive()` 的 `match cfg.mode` 新增 `RuntimeKind::Remote =>` 分支,`set_status(Disabled).with_runtime("remote")` 后 `return`,不 spawn/不启动 monitor 线程
- [x] 2.2 `runtime/mod.rs`:本机分支(`Native`/`Wsl`)改为从传入 `endpoint` 解析端口,替换原 `cfg.port` 入参
- [x] 2.3 `runtime/native.rs` / `runtime/wsl.rs`:`NativeBackend::new` / `WslBackend::new` 签名移除 `port` 参数,改用从 endpoint 推导的端口
- [x] 2.4 补单测——`Remote` 模式驱动后 supervisor 状态为 `Disabled`、未 spawn;从本机切到 `Remote` 仍 reap 自启 sidecar(运行时互斥)
- [x] 2.5 `cargo` 编译 + 现有 supervisor/core 单测全绿(回归)

## 3. 前端类型与状态派生

- [x] 3.1 `src/ipc/`:`RuntimeKind` 加 `'remote'`、`RuntimeConfig` 去 `port`,与 Rust 序列化对齐
- [x] 3.2 新增 `unifiedStatus(mode, supervisorStatus, agentStatus)` 纯派生函数:本机→supervisor.status,远程→agent.status,产出单一状态(dot 颜色 + 文案 key)
- [x] 3.3 为 `unifiedStatus` 补单测覆盖三模式各状态映射

## 4. 前端「运行来源」统一面板

- [x] 4.1 `SettingsModal.tsx`:合并 `AgentSection` 与 `RuntimeModeSection` 为单一面板,顶层三选一单轴(原生/WSL/远程),WSL 按 `wsl_detect().available` 门控
- [x] 4.2 单一状态点接 `unifiedStatus`,移除第二个状态点
- [x] 4.3 单一「应用」动作:本机=重新 `drive` supervisor + 重连,远程=仅重连探针;始终可点(不受 dirty 门控)
- [x] 4.4 字段按模式分流:WSL→发行版下拉;原生/WSL→启动命令(高级);远程→endpoint 整串编辑;发行版漂移提示仅 WSL 相关时呈现
- [x] 4.5 endpoint 编辑分流:本机模式 host 锁 `127.0.0.1`、仅端口可调(高级);远程模式整串可编辑;非法输入按 `set_endpoint` 错误提示
- [x] 4.6 远程模式呈现限制提示(需放行本应用 Origin、不支持鉴权 agent)

## 5. i18n 与收尾

- [x] 5.1 `settings.*` 新增中/英文案:`runtime.remote` 模式标签与描述、统一面板标题、远程限制提示、单一「应用」按钮文案
- [x] 5.2 `RuntimeConfig` 预留 `authToken?: Option<String>` 扩展位(仅类型/结构占位,不接线、不渲染)
- [x] 5.3 `npm run lint` 类型检查通过
- [ ] 5.4 手动验证:原生↔WSL↔远程 三模式互切,状态点与「应用」行为符合 spec;远程连一个手动启动的免鉴权 agent 能 connected
