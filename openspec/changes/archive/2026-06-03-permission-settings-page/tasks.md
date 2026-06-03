## 1. 前置依赖确认

- [x] 1.1 确认 workhorse-agent 的 `hot-reload-permission-config` 已实现并提供 `GET/PUT /v1/permission-config`（若未就绪，先按类型契约用 mock 推进 2–4）

## 2. Rust bridge 与 Tauri command

- [x] 2.1 `src-tauri/src/agent/mod.rs` 新增 `list_permissions()` 代理 `GET /v1/permissions`
- [x] 2.2 新增 `get_permission_config()` 代理 `GET /v1/permission-config`
- [x] 2.3 新增 `set_permission_config(cfg)` 代理 `PUT /v1/permission-config`，沿用既有错误约定
- [x] 2.4 `src-tauri/src/lib.rs` 注册 `agent_list_permissions` / `agent_get_permission_config` / `agent_set_permission_config` 三个 command
- [x] 2.5 Rust 单测：三方法对 agent 不可达返回 `transient` 错误

## 3. IPC 包装与类型镜像

- [x] 3.1 `src/ipc/permissions.ts` 定义 TS 类型：`PermissionDecision`、`PresetRule`、`PermissionRule`（含来源）、`PermissionConfig`
- [x] 3.2 实现三个 Result 模式包装函数（`listPermissions` / `getPermissionConfig` / `setPermissionConfig`），非 Tauri 环境返回 `notInTauri()`
- [x] 3.3 在 `src/ipc/index.ts` 导出

## 4. i18n 文案

- [x] 4.1 `zh-CN.json` 新增 `settings.permissions.*` 键（标题、列头、来源徽章、allow/deny、默认策略三态、按钮、错误/校验提示、占位示例）
- [x] 4.2 `en-US.json` 补齐对应英文键

## 5. PermissionsSection 组件

- [x] 5.1 新建 `PermissionsSection`：加载时并发拉 `GET /v1/permissions`（列表）与 `GET /v1/permission-config`（编辑初值），处理 loading/error/重试
- [x] 5.2 规则列表：按 tool/pattern/decision 渲染，allow/deny 色标 + preset/manual 来源徽章；manual 行只读（无编辑/删除入口）
- [x] 5.3 新增规则表单：tool 下拉（含 `*`）+ pattern 文本框（占位示例）+ allow/deny 二选一；提交前校验（pattern 非空、取值合法）
- [x] 5.4 删除 preset 规则：接 `global-confirm-dialog` 二次确认
- [x] 5.5 默认策略选择器：每次询问 / 始终允许 / 始终拒绝
- [x] 5.6 写入流程：构造新的 `PermissionConfig` → `setPermissionConfig` → 成功后重新拉 `listPermissions` 刷新（含短重试以回读热加载结果）；提交期间禁用表单
- [x] 5.7 全程使用 Tailwind 设计 token，无硬编码色值；全部文案走 i18n

## 6. 接入与验证

- [x] 6.1 `SettingsModal` 导航新增「权限」tab（i18n 标签），渲染 `PermissionsSection`
- [x] 6.2 `npm run lint` 通过（类型检查 + 无硬编码色值/中文字面量）
- [ ] 6.3 手动验证：新增 deny 规则 → 列表刷新出现该规则；删除 preset → 消失；切换默认策略 → 回读一致
- [ ] 6.4 远程模式下验证读写作用于远端 config.yaml（或以 mock 端点验证调用路径）
