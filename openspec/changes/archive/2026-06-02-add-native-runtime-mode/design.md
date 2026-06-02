## Context

排查记录(本次会话):app 的 agent bridge 只 attach 固定端口 `127.0.0.1:7821`,既不打包也不启动原生 `workhorse-agent`。唯一的自动 sidecar 来自 WSL supervisor(`managed=true`)。因此在 Windows 上,关掉"WSL 托管"开关后,app 仍会经 WSL2 localhost 转发连上 WSL 里残留的 sidecar,默认项目路径与 PTY 全部落到 `/home/...` 命名空间。

`workhorse-agent` 是 Go 模块(`go 1.22`),`serve` 支持 `--host`/`--port`(默认 `127.0.0.1:7821`),`default_workdir` 取 config 或进程 cwd(`internal/session/workdir.go:23` → `os.Getwd()`)。WSL supervisor 的纯决策核心(`decide`/`ownership_for`/`backoff_delay_ms`/`build_serve_command`)已有单测,IO 壳走 `wsl.exe`。

关键既有事实:下游"跟随运行时"已实现——
- PTY:`Terminal.tsx:179-184` 在 host 是 Windows 且 `/health` 报 `distro` 时把 `terminal` 升级为 `wsl`(`wsl.exe --cd`);无 `distro` 时直接 `powershell.exe` 落在 host 项目路径。
- 默认项目:`SessionProvider.tsx:448-449` 无记忆项目时取 `/health` 的 `default_workdir`。
- WSL 检测:`lib.rs:44` 的 `wsl_detect()`(`wsl -l -q`)。

## Goals / Non-Goals

**Goals:**

- 默认 Native:开箱即用,app 自托管 `workhorse-agent.exe`,PTY 为 powershell,项目为 C:\ D:\。
- 可选 WSL:仅在检测到 WSL 时可显式开启;PTY 为 `wsl.exe`,项目为 `/home/...`。
- 同一时刻单运行时,7821 上只有一个 sidecar;切换时强制 reap 旧的。
- 复用已实现的下游跟随逻辑,不重复造轮子。

**Non-Goals:**

- 不支持 Native 与 WSL **并存**(不分配多端口、渲染层不暴露 endpoint 选择)——本期互斥。
- 不实现"attach 到用户手动启动的外部 sidecar"作为一档模式(Native = 托管)。
- 不做配置迁移(早期阶段,无向后兼容)。
- 不改 sidecar(`workhorse-agent`)自身行为,只新增交叉编译产物。
- 不改 `/v1/*` 协议。

## Decisions

### D1: 用 `RuntimeMode` 枚举取代 `managed: bool`

```rust
enum RuntimeMode {
    Native,                 // 默认
    Wsl { distro: String },
}
struct RuntimeConfig { mode: RuntimeMode, port: u16, serve_cmd_override: Option<String> }
```

**理由:** `managed:bool` 把"是否托管"与"运行时=WSL"耦合,是本次 bug 的结构根源。枚举让运行时成为一等显式概念,Native 为默认与兜底。

**取舍:** 放弃向后兼容(早期阶段授权)。旧配置文件不迁移,首启回落 `RuntimeConfig::default() = Native`。

### D2: Native = 托管(app 自启 `.exe`),而非 attach

**理由:** 用户诉求是"原生直接启动即可",attach 会把"自己先起一个 sidecar"的摩擦留给用户,默认体验差。

**做法:** Native supervisor 以 host cwd 启动 `workhorse-agent.exe serve --host 127.0.0.1 --port <p>`;`default_workdir` 因此是 host 路径,下游自动得到 powershell + C 盘项目。退出/切换时回收。

### D3: 抽出运行时无关的 supervisor 决策核心,Native 复用之

**理由:** WSL supervisor 的"三道闸 + 固定端口自然互斥 + cmdline 身份校验 + SIGTERM→SIGKILL"已单测验证;这些决策与"在哪起进程"无关。

**做法:** `decide`/`ownership_for`/`backoff_delay_ms`/`next_on_child_exit`/ 端口探测分类(`PortProbe`)上移为共享核心;Native 与 Wsl 各自提供 IO 壳(前者 `Command::new(exe)`,后者 `wsl.exe`)与 cmdline 身份指纹。

### D4: 运行时互斥 —— 7821 复用 + 切换时先 reap 再 spawn

**理由:** WSL2 localhost 转发使"残留 sidecar"继续应答(本次 bug 实证)。只切配置不 reap = 串台。

**做法:** 切换 `RuntimeMode` 时,统一 driver 先对当前模式执行 teardown(reap 仅限"我们启动的"),确认 7821 释放后再启动目标模式。对 `Foreign`(无法确认是我们的)占用,拒绝接管并经 `supervisor://status` 报错,绝不杀外部进程。

**取舍:** 单端口 = 不能并存,但实现简单且与"单运行时"语义一致。若将来要并存,再引入分端口 + 渲染层 endpoint 选择(留作 future)。

### D5: 原生二进制经 `externalBin` 打包,CI 交叉编译

**理由:** Go 交叉编译 Windows 零障碍(`GOOS=windows GOARCH=amd64`)。Tauri `externalBin` 是分发随附二进制的标准机制。

**做法:** `tauri.conf.json` 增 `bundle.externalBin: ["bin/workhorse-agent"]`(Tauri 会按 target triple 解析 `workhorse-agent-x86_64-pc-windows-msvc.exe`);CI 从同级 `workhorse-agent` 仓 build 后置入。Native supervisor 经 Tauri 的 sidecar 路径解析定位该二进制。

**未知数:** `workhorse-agent` 仓需提供可复现的 Windows build(版本对齐、API key/config 的首启 `init`)。在 tasks 中显式立项确认。

### D6: 切换运行时清理跨命名空间状态

**理由:** `default_workdir` 自动成为默认项目;跨命名空间残留会把用户带到不存在的路径(WSL 路径在 host 无效,反之亦然)。

**做法:** 切换后渲染层 `useAgentConnection.reconnect()` 重新 probe,并清空 `localStorage['workhorse:currentProject']` 与在途 live sessions;`SessionProvider` 在 `default_workdir` 与当前 host 运行时命名空间不符时不自动 `openProject`,转而引导 picker。

### D7: Settings 以"运行时模式"选择器取代托管开关

**做法:** `SettingsModal.tsx` 渲染单选:`Native(默认)` 始终可选;`WSL` 仅在 `wsl_detect().available` 时可选并列出发行版。切换即调用新的 `set_runtime_config` 命令驱动 driver。

## Risks / Trade-offs

- **R1 残留 sidecar 串台**:必须真 reap 而非只改配置。缓解:D4 单端口互斥 + 身份校验;teardown 等待端口释放再 spawn。
- **R2 externalBin 版本漂移**:随附的 `.exe` 与 assistant 协议不匹配。缓解:`/health` 的 `protocol_version` 校验(已有字段),CI 锁版本。
- **R3 手动启动的外部 sidecar 抢占 7821**:supervisor 只认"我们启动的"。缓解:`Foreign` 占用时显式报错并提示用户,不静默采用(修正本次 bug 的核心)。
- **R4 热切换在途会话丢失**:切运行时 = 换命名空间,旧会话本就不可跨。缓解:切换前提示;清理而非迁移(早期阶段可接受)。
- **R5 首启 `init` 依赖**:Native agent 首次需 `~/.workhorse-agent/config.yaml` 与 API key。缓解:supervisor 启动前确保 `init`,缺 key 时经状态事件引导。

## Migration

无配置迁移(早期阶段)。首次启动读不到旧 `managed` 字段即回落 `RuntimeMode::Native`。开发者本地若有残留 WSL sidecar 占 7821,需手动 reap 一次(或切到 WSL 模式由 supervisor 接管)。

## Open Questions(已就 agent 侧调查更新)

- **Q1 Windows 二进制(大半已就绪)**:`workhorse-agent` 仓 `scripts/build.sh` 与 `.github/workflows/release.yml` 已交叉编译并发布 `windows/amd64`+`arm64` 产物。剩余工作全在 assistant 侧:把发布产物按 Tauri target triple 重命名(`workhorse-agent-x86_64-pc-windows-msvc.exe`)拉进 `src-tauri/bin/`,并经 `/health` 的 `protocol_version` 锁版本(task 1.1–1.4)。**待定:** 拉取走 assistant CI 还是手动 vendoring。
- **Q2 API key 首启(已定方案)**:`serve` 已支持无 `config.yaml`、纯 env 启动(agent `internal/config/load.go:80-99`),故 happy path 由 Settings 收 key → spawn 时注入 `WORKHORSE_AGENT_PROVIDERS_*` env 解决(本 proposal task 4.x / 7.x)。"key 尚未就位"的时间窗由 agent 侧配套 change **`add-degraded-health-keyless-serve`** 兜底:缺 key 时 `serve` 降级启动、`/health` 返回 `reason:"no_provider_key"`,assistant 据此弹精准引导而非看到 crash-loop。
- **Q3 运行时常驻指示器(建议做)**:鉴于本次困惑正源于"看不出连的是哪个运行时",倾向在主界面(TitleBar/AgentRail)常驻轻量标签显示 `Native (Windows)` / `WSL · <distro>`。属 polish,可排在功能跑通后。

## 跨仓依赖

- 上游 agent change:`workhorse-agent` 仓 `add-degraded-health-keyless-serve`(无 key 降级 + `/health` reason)。本 proposal 的 Native 首启引导依赖其 `reason:"no_provider_key"` 契约。
