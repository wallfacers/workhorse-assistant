## Context

最终目标（用户拍板）：**运行时模式 `RuntimeConfig` 是单一权威，agent 部署、项目目录、终端三者都跟着它走且保持同步。**

- WSL 模式（打包）：前端 Windows，agent 在 WSL 用户目录，项目 + 终端全在 WSL。
- Native 模式：全在 Windows，终端也是 Windows。

当前命名空间来源：

```
              RuntimeConfig.mode/distro (用户意图, 权威)
                          │
        ┌─────────────────┼──────────────────────┐
        ▼                 ▼                      ▼
   agent 部署         项目路径/picker          终端 (wsl profile)
   Supervisor 据      经 agent 的 fs API →     ❌ 当前取 /health.distro
   config 启动 ✓      天然在 agent 命名空间 ✓     而非 config
```

agent 部署与项目路径**已经**（传递地）跟随 config——因为 Supervisor 按 config 放置 agent，项目又经 agent 的文件系统 API。**唯一脱节的是终端**：它的 WSL 决策取 `/health.distro`（sidecar 自报）而非 `RuntimeConfig`。本 change 把这块拉回配置驱动。

已核实事实（消除了之前的关键未知）：
- `workhorse-agent` 的 `/health` **已上报 `distro`**：`internal/api/health.go::getDistro()` → 先 `isWSL()`（读 `/proc/version` 含 microsoft/wsl），再取 `$WSL_DISTRO_NAME`（注册名），回退 `/etc/os-release`。非 WSL 不带该字段。
- 既有 `wsl-remote` 规范已钉死：onWindows 宿主门控（Rust + 渲染双保险）、`/health.distro` 为注册名。

## Goals / Non-Goals

**Goals:**
- 终端的 WSL 决策与 `wsl.exe -d <distro>` 目标改由 `RuntimeConfig` 驱动。
- `/health.distro` 降为校验信号；漂移经 `supervisor://status` 上报；配置优先地对齐（必要时 reap+重启）。
- 设置区如实呈现实际/漂移并引导一键对齐。

**Non-Goals:**
- 不改 onWindows 宿主门控（保留为安全底线）。
- 不改 agent（经核实 `/health` 已满足校验所需）。
- 不改项目 picker（已在 agent 命名空间，天然随 config）——仅在任务中**验证**这一假设。
- 不做 + 菜单显式「WSL」项（见 D3）。

## Decisions

### D1（推翻先前版本）：`RuntimeConfig` 为运行时命名空间单一事实源

**本 change 早期版本曾决定「`/health.distro` 为准、终端不读 config」，现按用户「配置优先」目标推翻。**

新立场：用户选的 `RuntimeConfig.mode/distro` 是唯一权威开关。因为 Supervisor 已按 config 放置 agent，让终端读同一 config，三者（agent/项目/终端）**构造上即同步**，不再依赖「sidecar 是否恰好自报了 distro」。

- 终端提升条件：`RuntimeConfig.mode == Wsl && onWindows`；distro 用 `RuntimeConfig.distro`。
- `health.platform` 是 **sidecar 的** GOOS，不能当宿主信号——故 onWindows 宿主门控保留不变。

被推翻的理由再评估：先前担心「adopt 场景下只有 sidecar 知道实际在哪」。但配置优先的正解不是「跟随实际」，而是「**让实际对齐配置**」——adopt 到不符的就 reap+按 config 重启（见 D2）。

### D2：`/health.distro` 用于校验 + 配置优先地对齐（用户决定「可以杀」）

Supervisor 在 **adopt 落定后**（`PortProbe::HealthySidecar` → `ReconcileAction::Adopt`）抓 `/health.distro`，与 `backend.expected_distro()`（WSL: `Some(distro)`；Native: `None`）经纯函数 `core::distro_aligned` 比较：
- 一致 → 正常 `Adopted`，返回。
- 不符 → emit `Restarting` + `drift_reason("configured=X, actual=Y")`，`capture_pid()` 占用者并 `reap()`，`continue` 重新 probe（端口已空）→ Spawn 自己的。

**用户拍板「可以杀」**：即便 adopted 进程不是本系统自启（破坏了原「只 reap Ours」的归属保护），也强制按配置对齐。但**爆炸半径受控**：
- 对账只在 `HealthySidecar`（协议确认的 workhorse-agent）分支触发——真正的非 workhorse 占用仍走 `FailForeign`，**绝不触碰**。
- `MAX_RECONCILE_REAPS = 3` 上限：外部 sidecar 反复抢占端口时不会死循环，达上限 emit `Failed`。

> 自启 sidecar 不会触发此路径：我们用配置的 distro 启动，`$WSL_DISTRO_NAME` = 注册名 = 配置值，actual 必然对齐。漂移只发生在 adopt 别人起的 sidecar 时——而那正是要对齐的对象。Native 模式同理：`expected=None` 遇到带 distro 的 WSL sidecar 即判不符、reap、按 Native 重启。

### D3：+ 菜单暂不显式列「WSL」

`profiles.ts` 仍把 `wsl` 排除在 `PROFILE_ORDER` 外。配置驱动下，WSL 模式 + Windows 宿主时普通 `terminal` 已自动是 WSL 终端，无需手动项。若日后需要「在 WSL 模式下临时开一个本地 Windows 终端」之类反向诉求，再单开 change。

### D4：agent 无需改动

OQ1 已答：`/health` 已上报注册名 distro，足够做校验。保留「若验证中发现缺口再改 `internal/api/health.go`」作为兜底，但不列为本 change 的必做项。

## Risks / Trade-offs

- [终端改读 config 需把 mode+distro 暴露给渲染层终端组件] → 实现选择在 `Terminal.tsx` spawn 时直接 `await getRuntimeConfig()`（无独立 hook、无挂载竞态），`SessionProvider` 零改动。
- [adopt 到不符 sidecar 时自动 reap 可能误杀用户手动起的 agent] → 用户决定「可以杀」以贯彻配置优先；爆炸半径靠两道闸控制：(1) 只 reap 协议确认的 workhorse-agent（非 workhorse 走 `FailForeign` 不碰）；(2) `MAX_RECONCILE_REAPS=3` 防反复抢占死循环。代价：会终止用户在「错误 distro」里手动起的 workhorse-agent——但这正是配置优先的预期语义。
- [改配置后到 sidecar 重启完成前的窗口期，终端用新 config 但 agent 还是旧的] → 终端以 config 为准会瞬时领先于 agent；设置区漂移提示 + 引导「应用并重启」覆盖此窗口；可接受。
- [推翻既有 wsl-remote 规范属行为级 BREAKING] → 用户明确授权推翻；以 MODIFIED 完整改写该需求，archive 时替换旧语义。

## 跨 change 协同

本 change 与并行进行的 `decouple-project-from-launch-cwd`（解耦「项目」与 sidecar 启动目录）有相邻触点。三个 change（含 `add-runtime-restart-button`）的所有权边界如下，**避免双改/漏改**：

| 协同面 | 谁改 | 谁只读消费 |
|---|---|---|
| agent `/health.default_workdir`（→home）+ `/v1/fs` 收口 | **decouple** | 本 change 不碰 agent |
| agent `/health.distro` | **谁都不改**（已核实上报 `$WSL_DISTRO_NAME` 注册名）| 本 change 只读做校验/漂移提示 |
| `src/components/Terminal.tsx`（distro 来源、`mode==Wsl` 提升）| **本 change** | decouple 不碰 |
| `src/session/SessionProvider.tsx`（冷启动种子、空态 nag、`currentProject` 生产）| **decouple** | 本 change 只读 `currentProject` + `agentDistro` |
| `RuntimeModeSection`（重启按钮 + 漂移提示）| `add-runtime-restart-button` → 本 change（按序）| — |
| `src/components/ProjectBrowser.tsx`（按活动项目浏览）| **decouple** | — |
| i18n locale keys | 各加各（key 不撞）| — |

**唯一避让规则（硬约束）：本 change 不编辑 `SessionProvider.tsx`。**
终端不再依赖 `SessionProvider` 暴露的 `agentDistro` 决定是否提升 WSL，而是经一个**独立的 runtime-config 来源**（包 `getRuntimeConfig` + `onSupervisorStatus` 的小 hook）读 `mode`/`distro`；`currentProject` 仍从 `useSession()` **只读**取用作 `--cd`。`SessionProvider` 现有的 `agentDistro`（=`/health.distro`）**保留不删**——设置区漂移提示要拿它与 `RuntimeConfig.distro` 比对。如此 `SessionProvider` 的编辑权完全归 decouple，两条并行线只剩「生产者(decouple)/消费者(本 change)」关系，无同文件抢改。

> 落地顺序：`add-runtime-restart-button` 先（无依赖）→ 本 change（漂移引导用到那个按钮）；`decouple` 与二者无依赖，可并行。

## Migration Plan

- 渲染侧：终端提升源从 `/health.distro` 切到 `RuntimeConfig`；保留 onWindows 门控。
- Rust 侧：新增对账上报 + Native 拒绝 WSL sidecar + WSL adopt 不符时 reap 重启。
- 回滚：恢复终端读 `/health.distro` 即回到旧行为；对账上报可独立保留。

## Open Questions

- **OQ2**：漂移提示的呈现形态（替换徽章发行版名 vs 旁加 warning 行）——倾向后者，待设计 token。
- **OQ3**：项目 picker 是否确实始终走 agent 的 fs API（而非偶发宿主 dialog）？任务中验证；若有宿主 dialog 分支，需一并纳入配置驱动。
- ~~OQ1~~（已答）：`/health` 已上报注册名 distro，agent 无需改动。
