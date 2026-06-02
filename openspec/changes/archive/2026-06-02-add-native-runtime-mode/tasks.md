## 1. 原生二进制产出与打包(地基,先行)

- [x] 1.1 `workhorse-agent` 仓 `scripts/build.sh` + `.github/workflows/release.yml` 已交叉编译 windows/amd64+arm64(确认就绪,无需新增)
- [ ] 1.2 CI:从 `workhorse-agent` 仓 build 后按 Tauri triple 命名置入 assistant `src-tauri/bin/`(团队 CI 接线,待办)
- [x] 1.3 `tauri.conf.json` 增加 `bundle.externalBin: ["bin/workhorse-agent"]`
- [x] 1.4 `scripts/vendor-agent.sh` 产出 `src-tauri/bin/workhorse-agent-<triple>`;本机已 vendored,`cargo check` 通过 externalBin 校验

## 2. 配置层重构(无向后兼容)

- [x] 2.1 `config/mod.rs`:`RuntimeConfig { mode: RuntimeKind, distro?, serve_cmd_override?, port }` 取代 `WslConfig`;`RuntimeKind = Native | Wsl`,默认 Native
- [x] 2.2 缺失/旧 `wsl` 字段一律回落 Native(`legacy_wsl_schema_resolves_to_native` 测试),不阻断启动
- [x] 2.3 更新 config 单测(默认 Native、回落、legacy、endpoint 解析顺序)

## 3. Supervisor 决策核心抽取

- [x] 3.1 `runtime/core.rs`:运行时无关纯核心(`decide`/`ownership_for`/`backoff_delay_ms`/`next_on_child_exit`/`is_workhorse`/`parse_port`/`build_serve_command` + 枚举),含单测
- [x] 3.2 `Backend` trait(`runtime/mod.rs`):`probe`/`spawn`/`capture_pid`/`reap`/`endpoint`/`label`;`run_monitor` 泛型化
- [x] 3.3 复用既有 WSL 单测;新增 core/native/wsl 后端单测(共 38 个 Rust 测试通过)

## 4. Native supervisor 后端

- [x] 4.1 `runtime/native.rs`:host cwd `Command::new(<sidecar>)` 启动 `serve --host 127.0.0.1 --port <p>`;`child.id()` 即 reap pid
- [x] 4.2 跨平台端口属主发现(linux `ss`/macos `lsof`/windows `netstat`)区分 Foreign vs OurRemnant;`reap_host`(unix `kill`/windows `taskkill`)SIGTERM→SIGKILL
- [x] 4.3 无 config/key 不再 crash-loop:由配套 agent change `add-degraded-health-keyless-serve` 兜底(降级启动 + `/health` reason),`probe_healthy` 按 `protocol_version` 而非 `ok` 判定,故降级 sidecar 仍被纳管
- [x] 4.4 `resolve_program` 优先 bundled sidecar(externalBin,exe 同级目录),回落 PATH;端到端验证 spawn/probe/reap

## 5. 统一运行时 driver 与互斥

- [x] 5.1 `lib.rs`:`set_managed_config`→`set_runtime_config`,按 `RuntimeMode` 派发 Native/WSL 后端;`get_runtime_config`
- [x] 5.2 切换运行时:`drive` 先 `teardown_internal`(仅 reap"我们启动的")再起目标后端(运行时互斥)
- [x] 5.3 `Foreign` 占用 → `FailForeign` → supervisor `Failed` 报冲突,绝不杀外部进程(`decide`/`ownership_for` 保证)
- [x] 5.4 app 退出/窗口销毁统一 `shutdown()` teardown(`lib.rs` RunEvent)

## 6. 渲染层:切换后重连与状态清理

- [x] 6.1 运行时切换后 Settings `apply` 调 `onReconnect`(`useAgentConnection.reconnect`)重新 probe `/health`
- [x] 6.2 `SessionProvider.resetProjectForRuntimeSwitch`:清 `localStorage['workhorse:currentProject']` + 在途会话 + bootstrap refs;Settings 在 mode/distro 变化时调用
- [x] 6.3 清理后 `currentProject` 为空,bootstrap 从新运行时 `/health` default_workdir 重新种入(命名空间自洽,不再跨命名空间残留)

## 7. Settings UI

- [x] 7.1 `SettingsModal.tsx`:`RuntimeModeSection` 用 Native/WSL 单选卡取代托管开关;Native 始终可选,WSL 仅 `wsl_detect().available` 可选
- [x] 7.2 切换调 `set_runtime_config`;状态徽标含运行时标签(`status.runtime`)
- [x] 7.3 i18n:`settings.runtime.*`(zh-CN / en-US)取代 `settings.wsl.*`

## 8. 下游回归验证(逻辑不改,验证跟随)

- [x] 8.1 Native:`/health` 返回 host `default_workdir`(端到端验证);PTY/默认项目逻辑未改,继续 key 在 `distro`/`default_workdir`
- [x] 8.2 WSL:逻辑保留(WslBackend 复用原 wsl.exe IO + 单测)
- [ ] 8.3 真 Windows 主机上 native(distro 缺省→powershell+C盘)与切换互斥(见手动验证 E1–E5,无法在 Linux/CI 跑)

## 9. 文档

- [x] 9.1 `docs/` 无现存"托管 sidecar 部署"文档需改(grep 无命中);openspec specs 在归档时更新
- [ ] 9.2 `AGENTS.md` 运行时模式简述(待归档时与 spec 同步)

## 手动验证(Windows host,无法在 Linux/CI 跑)

- [ ] E1 Native 全新启动:无 sidecar → app 自启 bundled `.exe` → powershell + C 盘项目
- [ ] E2 装了 WSL:Settings 出现 WSL 选项,切换后 PTY/项目切到 WSL
- [ ] E3 切回 Native:WSL sidecar 被 reap,7821 不再被 WSL 进程应答
- [ ] E4 外部手动 sidecar 占 7821:supervisor 报冲突而非静默采用
- [ ] E5 app 退出:自启 sidecar(Native 或 WSL)被回收,无泄漏
