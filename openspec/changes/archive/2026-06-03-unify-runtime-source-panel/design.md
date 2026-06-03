## Context

设置面板的「连接」(`AgentSection`)与「运行时模式」(`RuntimeModeSection`)当前嵌套在同一个 Agent tab 里(`SettingsModal.tsx:279`),却以两套并列的交互呈现同一个语义轴——"对话的 agent 从哪来"。这造成数据层与交互层的双重重复:

- **数据层**:端口存了两份。`AppConfig.endpoint`(`config/mod.rs:66`,如 `http://127.0.0.1:7821`)与 `RuntimeConfig.port`(`config/mod.rs:54`,`u16`)各自独立,无任何同步约束(实测可不一致)。`drive()` 用 `endpoint` 探针、用 `cfg.port` 拉起,二者错配会导致"改了地址却连不上"。
- **交互层**:两个状态点(`agent.status` 连通性 / `supervisor.status` 进程态)、两个保存按钮(「保存并重连」仅探针 / 「应用并重启」reap+spawn+探针,后者是前者超集)。

后端 `workhorse-agent` 已具备远程连接能力:`/health.capabilities` 含 `external_agents`,支持非 loopback 绑定 + Origin 白名单 + 可选 Bearer token。但当前桌面端的并列结构无法干净表达"远程时 runtime 无意义、本机时 endpoint 由 runtime 推导"这一互斥关系。

## Goals / Non-Goals

**Goals:**
- 把两块聚合为单一「运行来源」面板:三模式单轴(原生/WSL/远程)。
- 端口收敛为单一真相(`endpoint`),消除 `RuntimeConfig.port` 这份重复数据。
- 两个状态点派生合并为一个;两个按钮收成一个「应用」。
- 新增远程模式,复用现有 auto-connect 探针做存活性,后端状态机零改动。
- 为后续远程鉴权(`authToken`)预留无返工的扩展位。

**Non-Goals:**
- 不实现远程 Bearer token 鉴权(本次仅连免鉴权 + 已放行 Origin 的远程 agent)。
- 不改动 supervisor 状态机核心(`runtime/core.rs`)、`Backend` trait、`workhorse-agent` 后端。
- 不引入任何新的 renderer 网络权限。
- 不改动终端命名空间/项目路径逻辑(`wsl-remote` 能力不受影响)。

## Decisions

### 决策 1:远程模式走 R2(supervisor 禁用),而非 R1(RemoteBackend)

**选择**:远程模式下 `drive()` 直接 `set_status(Disabled).with_runtime("remote")` 并返回;存活性由 `useAgentConnection` 的 `/health` 探针负责。

**理由(基于状态机行号推演)**:
- `run_monitor`(`runtime/mod.rs:264`)的 `Adopt` 分支在对齐成功后立即 `return`(`:287`,注释 "reachability is auto-connect's job")。即便走 R1,远程一旦连上,supervisor 也马上退出、把存活性交回 auto-connect——等于绕一圈回到 R2,却多写一个空壳 Backend。
- 远程**不健康**时,现有四个 `ReconcileAction` 无一适用:`Free→Spawn` 会触发 `spawn()` 报错并在 5 次退避后**永久 Failed**(`:343`);`Foreign→FailForeign` 会给出"非 workhorse 进程占用"的错误文案(`:321`)。要修必须新增 `ProbeAgain` 状态 + 非终态轮询子循环,且会与 auto-connect **重复探测同一 `/health`**。
- `distro_aligned`(`core.rs:166`)在 `Adopt` 时对账(`runtime/mod.rs:285`):远程 agent 若本身跑在 WSL 会上报 `distro`,而 `RemoteBackend.expected_distro()=None` 与之不对齐(`core.rs:169`),触发 reap 路径——但远程 `capture_pid()=None`、`reap` 为 noop,循环至 `reconcile_reaps>3` 后误判 `Failed`("外部 sidecar 反复抢占端口")。一个健康的远程 WSL agent 会被判死刑。修复需在通用 monitor 里给 remote 开特例,破坏 `runtime/mod.rs:14` 标榜的 "monitor stays runtime-agnostic"。

**结论**:R1 要么塌缩回 R2、要么需三处特例 + 双重探针;R2 用更少部件达成更完整的行为(全状态闭环、存活性单源、抽象不被侵蚀)。

**备选**:R1(RemoteBackend 走 supervisor)——已评估并否决,见上。

### 决策 2:端口单一真相 = `endpoint`,删除 `RuntimeConfig.port`

**选择**:`RuntimeConfig` 移除 `port: u16`;`drive()` 从传入的 `endpoint` 解析端口喂给 backend 构造函数;`NativeBackend::new`/`WslBackend::new` 签名去 `port`。

**理由**:`endpoint` 是 auto-connect 探针与 bridge 通信的实际地址,本就是权威;`runtime.port` 是冗余副本。以 `endpoint` 为单源,结构上杜绝错配。

**迁移**:`serde` 对已删除字段默认忽略未知键即可(`RuntimeConfig` 反序列化时遗留 `port` 被丢弃),无破坏性迁移、无版本号 bump。

**备选**:保留两字段并加双向同步逻辑——否决,因为同步逻辑本身是新的出错面,不如消除其一。

### 决策 3:状态合并为前端纯派生函数

**选择**:新增一个 `unifiedStatus(mode, supervisorStatus, agentStatus)` 前端函数;本机模式映射 `supervisor.status`,远程模式映射 `agent.status`。后端 `SupervisorStatus`/`agent.status` 结构不变。

**理由**:两个状态本就是两套真相来源(进程态 vs 连通性),且 supervisor 在 `Adopted` 后即停止监控、存活性本就回落到 auto-connect 探针——所以"按模式选权威来源"是对现有事实的如实呈现,而非新机制。纯前端实现,风险最低。

### 决策 4:endpoint 可编辑性按模式分流

**选择**:本机模式 host 锁 `127.0.0.1`、仅端口可调(高级字段);远程模式整串可编辑。

**理由**:supervisor 恒将 sidecar 绑定 loopback(`build_serve_command` 写死 `--host 127.0.0.1`),本机模式放开 host 会造成"填了局域网 IP 却仍绑 loopback"的连不上陷阱。远程模式才需要非 loopback。

## Risks / Trade-offs

- **[远程无鉴权,实用面受限]** → 本次只连免鉴权 + 已放行 Origin 的远程 agent;UI 明确提示限制;`RuntimeConfig` 预留 `authToken: Option<String>` 扩展位,后续接 bridge 注入 `Authorization` 头即可,不返工。
- **[端口字段删除影响 WSL backend 的 `parse_port` 兜底]** → `wsl.rs`/`native.rs` 当前从 `serve_cmd_override` 用 `parse_port` 解析端口;改为统一从 `endpoint` 解析,需确认 override 含 `--port` 时两者一致(以 endpoint 为准,override 的 port 仅影响实际监听——这是既有的高级用户责任,保持不变并在 hint 说明)。
- **[远程 agent 跑在 WSL 上报 distro,触发既有 `wsl-remote` 校验]** → R2 下远程不经 supervisor 的 distro 对账路径,天然规避;终端命名空间逻辑由 `RuntimeConfig.mode` 驱动,远程模式不促升 `wsl` 终端(host-OS 门控不变)。
- **[迁移:旧 config 含 `port`]** → serde 忽略未知字段,无破坏;补一条单测覆盖"旧 config 反序列化丢弃 port、以 endpoint 为准"。
- **[UI 重构面较大]** → `AgentSection` 与 `RuntimeModeSection` 合并是单文件(`SettingsModal.tsx`)内重组,无跨模块扩散;现有 i18n key 增量添加,不破坏既有 key。

## Migration Plan

1. **Rust 数据模型**:`RuntimeConfig` 删 `port`、`RuntimeKind` 加 `Remote`;`drive()` 加 `Remote => Disabled` 分支并改本机分支从 endpoint 解析端口;backend 构造签名去 `port`。补单测:旧 config 反序列化、端口解析、remote 驱动禁用。
2. **前端类型与 IPC**:`RuntimeConfig` 去 `port`、`RuntimeKind` 加 `remote`;新增 `unifiedStatus` 派生函数。
3. **前端面板**:合并 `AgentSection`/`RuntimeModeSection` 为单一「运行来源」面板;三模式单轴、单状态点、单「应用」、字段按模式分流、endpoint 编辑分流。
4. **i18n**:新增 `settings.runtime.remote`、统一面板与远程限制提示文案(中/英)。
5. **回滚**:本次无破坏性数据迁移,回滚即还原代码;旧版读新 config 时 `Remote` 模式会落回默认 `Native`(serde rename lowercase 未知变体需确认 default 兜底)。

## Open Questions

- 旧版 app 读到 `mode: "remote"` 的 config 时是否优雅兜底为 `Native`?需确认 `RuntimeKind` 反序列化对未知变体的行为(必要时加 `#[serde(other)]` 或自定义 default),避免向前兼容性崩溃。
- 本机模式高级端口编辑的 UI 形态:是暴露完整 `endpoint`(只读 host + 可编辑 port)还是单独一个"端口"数字输入?倾向后者更不易误填,留待实现时定。
