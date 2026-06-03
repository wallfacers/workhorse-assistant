## Why

设置面板里「连接」与「运行时模式」是两块并列的配置,但它们回答的是同一个问题——"我要对话的 agent 从哪来"。这造成三处真实重复:**端口被存了两份**(`AppConfig.endpoint` 字符串里的端口 + `RuntimeConfig.port`,二者无任何同步,可不一致)、**两个"保存"按钮**(「保存并重连」与「应用并重启」,后者是前者的超集)、**两个状态点**(连通性 `agent.status` 与进程态 `supervisor.status`,语义重叠)。同时,产品需要支持"连接到一个已在远端运行的 agent",而当前 endpoint 与 runtime 的并列结构无法干净表达"远程时 runtime 无意义、本机时 endpoint 由 runtime 推导"这一互斥关系。

## What Changes

- 把「连接」与「运行时模式」聚合为单一的**「运行来源」**面板:顶层三选一单轴 —— `原生 / WSL / 远程`。
- 新增 **`远程`** 运行时模式:连接到一个已运行的外部 agent。采用 **R2 架构** —— 远程模式下 supervisor 直接 `Disabled` 不参与(无进程可托管),存活性完全交给现有的 `agent.status`(auto-connect)探针。
- **端口收敛为单一真相**:**BREAKING** 删除 `RuntimeConfig.port`,本机模式下端口从 `endpoint` 解析后喂给 supervisor。旧配置中的 `port` 字段读到即忽略(向后兼容,无破坏性迁移)。
- **状态合并**:两个状态点派生为一个 —— 本机模式映射 `supervisor.status`,远程模式映射 `agent.status`(纯前端派生函数,后端状态机零改动)。
- **动作合并**:两个保存按钮收成一个「应用」,行为随模式而定(本机=重启 supervisor,远程=重连探针)。
- **endpoint 可编辑性按模式分流**:本机模式 host 锁定为 loopback、仅端口可调(高级);远程模式整串可编辑。
- 本次**不含远程鉴权(Bearer token)**:仅支持连接已放行本应用 Origin 且未启用鉴权的远程 agent;数据结构为后续 `authToken` 预留扩展位,不返工。

## Capabilities

### New Capabilities
- `runtime-source-panel`: 统一的「运行来源」设置面板 —— 三模式单轴选择、单一派生连接状态、单一「应用」动作、按模式分流的字段(发行版/启动命令 vs 远程地址)、endpoint 可编辑性规则、远程连接的限制提示。

### Modified Capabilities
- `runtime-mode`: `RuntimeMode` 新增 `Remote` 变体;`RuntimeConfig` 删除 `port`(端口改由 `endpoint` 推导);远程模式下 supervisor `Disabled` 不 spawn/reap,存活性委派 auto-connect;运行时互斥在三模式间仍成立。
- `agent-auto-connect`: endpoint 由 V1 的"只读"改为**用户可编辑**(校验 `http(s)://host[:port]`);远程模式下 auto-connect 探针为**唯一存活性来源**,统一状态面板的状态据其派生。

## Impact

- **前端**:`src/components/SettingsModal.tsx`(`AgentSection` + `RuntimeModeSection` 合并重构为统一面板 + 派生状态函数);`src/ipc/`(类型 `RuntimeConfig` 去 `port`、`RuntimeKind` 加 `remote`)。
- **Rust**:`src-tauri/src/config/mod.rs`(`RuntimeConfig` 去 `port`、`RuntimeKind` 加 `Remote`、迁移忽略旧 `port`);`src-tauri/src/runtime/mod.rs`(`drive()` 的 match 加 `Remote => Disabled` 分支、本机分支改从 endpoint 解析端口);`src-tauri/src/runtime/native.rs`/`wsl.rs`(构造函数签名去 `port`);`src-tauri/src/agent/mod.rs`(`set_endpoint` 增加端口可解析校验)。
- **i18n**:`settings.*` 文案新增"远程"模式、统一面板标题、远程限制提示。
- **不影响**:supervisor 状态机核心(`runtime/core.rs`)、Backend trait、agent 后端(`workhorse-agent`)均无需改动;不新增任何 renderer 网络权限。
