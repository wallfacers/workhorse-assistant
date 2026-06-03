# visual-theme Specification

## ADDED Requirements

### Requirement: 圆角尺度复刻 Claude 文档站

系统的圆角语言 SHALL 采用一套**按角色划分的扁平尺度**,取值复刻 Claude 文档站
(`code.claude.com/docs`)实测的 computed `border-radius`:容器 `16px`、控件
`12px`、行内 `6px`、小图标按钮 `8px`、pill `full`。所有容器(面板、卡片、消息气泡、
代码块、表格、callout、模态框、tooltip)SHALL 使用同一个 `16px`,**不再**保留
"外层大于内层"的同心圆角层级。窗口根 SHALL 作为唯一例外保留其较大圆角与 OS 区域圆角。

#### Scenario: 容器统一为 16px

- **WHEN** 渲染任一容器类表面(面板 / 卡片 / 消息气泡 / 代码块 / 表格 / callout / 模态框 / tooltip)
- **THEN** 其圆角 SHALL 为 `16px`
- **AND** 同心嵌套的容器之间 SHALL NOT 因层级而使用不同圆角

#### Scenario: 控件与行内元素的圆角

- **WHEN** 渲染按钮 / 输入框 / chip
- **THEN** 其圆角 SHALL 为 `12px`
- **WHEN** 渲染行内代码
- **THEN** 其圆角 SHALL 为 `6px`
- **WHEN** 渲染小图标按钮(如代码块复制按钮)
- **THEN** 其圆角 SHALL 为 `8px`
- **WHEN** 渲染头像 / 状态点 / 徽章 / pill
- **THEN** 其圆角 SHALL 为 `full`(9999px)

#### Scenario: 窗口根为唯一例外

- **WHEN** 应用以无边框浮动窗口运行
- **THEN** 窗口根 SHALL 保留其较大圆角(约 `28px`)与 Windows DWM 系统区域圆角
- **AND** 窗口根 SHALL NOT 被收敛到容器的 `16px`

#### Scenario: AI 对话 markdown 渲染与尺度一致

- **WHEN** 渲染 AI 对话中的 markdown(代码块、表格、行内代码、复制按钮)
- **THEN** 这些元素的圆角 SHALL 取自上述角色尺度,而非游离的硬编码值(如旧的
  `4px` / `12px` / `1rem`)
- **AND** 代码块容器 SHALL 为 `16px`、表格外框 SHALL 为 `16px`、行内代码 SHALL 为
  `6px`、复制按钮 SHALL 为 `8px`

#### Scenario: DESIGN.md 与运行时 token 一致

- **WHEN** 修改任一圆角 token
- **THEN** `docs/DESIGN.md` 的 `rounded:` 块(真源)与 `src/index.css` 的
  `--radius-*` SHALL 取值一致
- **AND** `src/design-tokens.generated.css` SHALL 由 `npm run design:export:css`
  重新导出保持同步
- **AND** `docs/DESIGN.md` SHALL NOT 再保留"同心圆角(外大内小)不可破坏"的约束
