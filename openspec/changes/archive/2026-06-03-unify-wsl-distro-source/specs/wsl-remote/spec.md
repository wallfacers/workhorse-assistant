## MODIFIED Requirements

### Requirement: WSL terminal bridge only on a Windows host

The `wsl` terminal profile (`wsl.exe -d <distro> --cd <path>`) SHALL be launched
only when the assistant's **host process runs on Windows**. When the host is not
Windows — including when the assistant build itself runs inside WSL/Linux — the
assistant SHALL NOT spawn `wsl.exe`; it SHALL launch a local shell rooted at the
project `workdir` instead. The host-Windows gate SHALL exist in the Rust PTY
layer (the authoritative, compile-time host-OS check) AND the renderer's
`terminal`→`wsl` auto-promotion SHALL respect the same host-OS signal.

The decision to promote a `terminal` pane to `wsl`, and the `<distro>` passed to
`wsl.exe -d`, SHALL be driven by the persisted **`RuntimeConfig`** (the user's
chosen mode and distro), **NOT** by `GET /health`'s reported `distro`. A
`terminal` pane SHALL promote to `wsl` exactly when `RuntimeConfig.mode == Wsl`
AND the host is Windows, using `RuntimeConfig.distro` as the bridge target.
`/health.distro` SHALL NOT be the source of the terminal's namespace decision; it
is reserved for validation (see "配置 distro 与实际 distro 校验").

> Rationale: config-priority. The runtime mode the user selected is the single
> authoritative switch for the namespace (agent placement, project paths, and
> terminal). Because the supervisor already launches the agent per
> `RuntimeConfig`, sourcing the terminal from the same config keeps all three in
> sync by construction, instead of depending on whether the sidecar happened to
> self-report a distro. `health.platform` is still the **sidecar's** GOOS, so the
> host-Windows gate (not `health.platform`) remains the correct signal for "can
> we run `wsl.exe`".

#### Scenario: Assistant runs inside WSL/Linux (non-Windows host)

- **WHEN** the assistant build runs on Linux (e.g. inside WSL), regardless of
  `RuntimeConfig.mode` or any `/health` `distro`
- **THEN** a new `terminal` pane launches a local shell (`$SHELL`/`bash`), not
  `wsl.exe`
- **AND** the shell is rooted at the project `workdir`

#### Scenario: Windows host in WSL mode bridges using the configured distro

- **WHEN** the assistant build runs on Windows and `RuntimeConfig.mode == Wsl`
  with `RuntimeConfig.distro = "Ubuntu"`
- **THEN** a new `terminal` pane launches `wsl.exe -d Ubuntu --cd <workdir>`
- **AND** the bridge target `Ubuntu` is taken from `RuntimeConfig.distro`, not
  from `/health.distro`

#### Scenario: Windows host in Native mode stays on the Windows shell

- **WHEN** the assistant build runs on Windows and `RuntimeConfig.mode == Native`
- **THEN** a new `terminal` pane launches the native Windows shell (pwsh/powershell)
- **AND** SHALL NOT promote to `wsl`, even if `/health` were to report a `distro`

## ADDED Requirements

### Requirement: 配置 distro 与实际 distro 校验

`RuntimeConfig`（用户选择、Supervisor 据以启动）SHALL 为运行时命名空间的**权威意图**。`/health.distro`（sidecar 自报的实际运行注册名）SHALL 用于**校验实际是否与配置一致**，而非驱动终端/项目的命名空间决策。

Supervisor 在 adopt 落定后 SHALL 比较 `RuntimeConfig` 的意图与 `/health` 的实际值；不一致时 SHALL 经 `supervisor://status` 上报可读漂移原因。**配置优先**：adopt 到发行版不符的 sidecar 时，系统 SHALL reap 该 sidecar 并按 `RuntimeConfig` 重新启动，而非将就实际值（WSL 配置对不符发行版如此，Native 配置遇到带 `distro` 的 WSL sidecar 亦如此）。

对账与重启 SHALL 受两道安全边界约束：
- **身份闸**：仅当占用者为协议确认的 `workhorse-agent`（即 `/health` 通过、归类为可采用的 sidecar）时才 reap；无法确认为 `workhorse-agent` 的占用者 SHALL 仍按既有 `FailForeign` 处理，绝不 reap。
- **次数上限**：连续因发行版不符而 reap 的次数 SHALL 有上限；达到上限后 SHALL 经 `supervisor://status` 报 `Failed`（外部 sidecar 反复抢占端口），不无限循环。

> 该校验依赖 `RuntimeConfig.distro` 与 `/health.distro` 同为 WSL **注册名**：前者源自 `wsl_detect()`（`wsl -l`），后者源自 `$WSL_DISTRO_NAME`（见既有「WSL distro identifier is the registration name」需求），二者可直接比较。自启 sidecar 用配置 distro 启动，二者必然一致，不触发重启路径。

#### Scenario: 自启 sidecar 时配置与实际一致

- **WHEN** Supervisor 在 `Wsl{distro=Ubuntu}` 下自行 spawn 并通过首个 `/health`，实际上报 `distro = "Ubuntu"`
- **THEN** 配置与实际一致，不产生漂移上报

#### Scenario: WSL 模式 adopt 到发行版不符 — 配置优先重启

- **WHEN** `RuntimeConfig.mode == Wsl{distro=Ubuntu}`，但端口上 adopt 到的 sidecar `/health.distro = "Debian"`
- **THEN** 系统 SHALL 经 `supervisor://status` 上报「configured=Ubuntu, actual=Debian」漂移
- **AND** SHALL reap 该 sidecar 并按配置（Ubuntu）重新启动，使实际对齐配置

#### Scenario: Native 模式遇到 WSL sidecar — 按配置重启

- **WHEN** `RuntimeConfig.mode == Native`，但端口上的 sidecar `/health` 带 `distro = "Ubuntu"`
- **THEN** 系统 SHALL 视为与配置矛盾，经 `supervisor://status` 上报
- **AND** SHALL reap 该 WSL sidecar 并按 Native 配置重新启动

#### Scenario: 非 workhorse 占用者不被 reap

- **WHEN** 端口被一个无法确认为 `workhorse-agent` 的进程占用
- **THEN** 系统 SHALL 按既有 `FailForeign` 处理并上报，SHALL NOT reap 该进程
- **AND** 发行版对账逻辑 SHALL NOT 触及该进程

#### Scenario: 外部 sidecar 反复抢占端口达上限

- **WHEN** 每次按配置重启后，外部 sidecar 又以不符的发行版重新占用端口，连续超过对账重启次数上限
- **THEN** 系统 SHALL 停止重试并经 `supervisor://status` 报 `Failed`，附「外部 sidecar 反复抢占端口」原因
