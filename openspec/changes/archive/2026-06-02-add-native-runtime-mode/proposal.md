## Why

当前 app **没有 Windows 原生运行时**:它从不打包、也从不启动 `workhorse-agent`,只会 attach 到固定端口 `127.0.0.1:7821`(`agent/mod.rs:13,43`)。唯一能自动拉起 sidecar 的途径是 WSL supervisor,且仅在 `managed=true` 时生效(`lib.rs:280-282`、`config/mod.rs:28`)。

后果是:即便用户在 Windows 上、且关闭了"WSL 托管 Sidecar"开关,只要 WSL 里残留一个监听 7821 的 `workhorse-agent`,WSL2 的 localhost 转发就会让 app 静默连上它 → `/health` 报 `default_workdir=/home/...` → 默认项目路径、PTY 全部落到 WSL 命名空间。实测复现:一个 26 小时前手动 `./workhorse-agent serve` 启动的 WSL 进程(pid 264081)至今占着 7821,`sessions_active:5`。

根因不是"误连",而是**架构上缺失原生运行时**:`managed:bool` 把"是否托管"和"运行时是 WSL"两件事耦合在一起,没有"原生 Windows"这条路。

## What Changes

> 项目处于早期阶段,**不保留向后兼容**。直接用运行时模式枚举取代 `managed` 布尔。

- **引入 `RuntimeMode` 枚举**(持久化,默认 `Native`):`Native | Wsl { distro }`,取代 `WslConfig.managed: bool`。
- **新增 Native supervisor**:作为现有 WSL supervisor 的镜像,把打包进 app 的 `workhorse-agent.exe` 在 Windows host 上拉起(`serve --host 127.0.0.1 --port 7821`,cwd = host 路径)并在退出/切换时回收。复用 WSL supervisor 已验证的"三道闸 + 端口自然互斥 + 身份校验真 reap"模型。
- **打包原生二进制**:`workhorse-agent` 用 `GOOS=windows GOARCH=amd64 go build` 交叉编译,作为 Tauri `externalBin` sidecar 随 app 分发。
- **运行时互斥(单 sidecar)**:同一时刻只有一种运行时占用 7821。切换模式时**先 reap 当前 sidecar,再启动目标**,杜绝 localhost 转发串台。
- **WSL 模式按检测门控**:`Wsl` 选项仅在 `wsl_detect().available` 为真时在 Settings 可选;默认且兜底为 `Native`。
- **切换运行时清理跨命名空间状态**:切模式后渲染层 `reconnect()`,并清空当前项目记忆(`localStorage['workhorse:currentProject']`)与在途会话,避免把用户带到错误命名空间的路径。

下游"跟随运行时"的行为**无需新增**——PTY 升级(`Terminal.tsx:179-184` / `pty/mod.rs`)和默认项目路径(`SessionProvider.tsx:448-449`)已 key 在 `/health` 的 `distro`/`default_workdir` 上,正确的 sidecar 一就位即自动各就各位。

## Capabilities

### New Capabilities
- `runtime-mode`: 显式的运行时模式选择(Native 默认 / WSL 可选),含 Native sidecar 的打包与生命周期托管、运行时互斥、切换时的状态清理。

### Modified Capabilities
- `wsl-managed-sidecar`: `managed: bool` 配置被 `RuntimeMode` 枚举取代;WSL supervisor 从"唯一托管路径"降级为"两种运行时之一",由统一的运行时选择器驱动。

## Impact

- **配置层**:`config/mod.rs` 的 `WslConfig{managed,...}` 重构为 `RuntimeConfig{mode: RuntimeMode, ...}`;持久化 schema 变更(无迁移,早期阶段)。
- **Rust supervisor**:`wsl/supervisor.rs` 抽出运行时无关的纯决策核心(`decide`/`ownership`/`backoff`),新增 `native` spawn/reap 的 IO 壳;`lib.rs` 的 `set_managed_config`/`drive` 改为按 `RuntimeMode` 派发。
- **打包**:`tauri.conf.json` 新增 `bundle.externalBin`;新增 CI 步骤从 `workhorse-agent` 仓交叉编译 Windows 二进制。
- **Settings UI**:`SettingsModal.tsx` 把"WSL 托管开关"替换为"运行时模式"选择器(Native / WSL[按检测可选])。
- **渲染层**:运行时切换后 `useAgentConnection.reconnect()` + 清项目/会话记忆;`SessionProvider` 默认项目逻辑在跨命名空间时不自动 `openProject`。
- **下游 PTY/项目路径**:逻辑不变,仅受益于"现在能落到 Native 运行时"。
