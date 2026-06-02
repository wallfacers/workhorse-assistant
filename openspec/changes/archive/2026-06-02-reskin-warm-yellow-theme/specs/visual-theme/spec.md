## ADDED Requirements

### Requirement: 暖淡黄底色板

系统的浅色主题 SHALL 以明确的淡黄为底,取代原冷灰白。三个底色 role token SHALL 保持"地面 < 主区 < 卡片"的由暗到亮三级阶梯,使内容浮于其上有清晰的图底关系。

#### Scenario: 浅色底色为淡黄三级阶梯

- **WHEN** app 运行于浅色模式
- **THEN** `--color-canvas` SHALL 为最深的淡黄(app 外壳地面)
- **AND** `--color-surface-muted` SHALL 为中间调淡黄(主聊天区底)
- **AND** `--color-surface` SHALL 为最亮的暖白(卡片/侧栏/右栏/助手气泡)
- **AND** 三者亮度 SHALL 满足 canvas < surface-muted < surface

#### Scenario: DESIGN.md 与运行时 token 一致

- **WHEN** 修改任一颜色 token
- **THEN** `docs/DESIGN.md` 的 `colors:` 块(真源)与 `src/index.css` 的 `@theme` 块 SHALL 取值一致
- **AND** `src/design-tokens.generated.css` SHALL 由 `npm run design:export:css` 重新导出保持同步

### Requirement: 赤陶橙强调色

系统的灵魂色 SHALL 为 Claude 风格的赤陶橙(terracotta)系,取代原深青绿。`primary` SHALL 用于用户气泡与主肯定;`tertiary` SHALL 用于执行动作的按钮;`secondary` SHALL 用于链接与 hover 态。

#### Scenario: 用户气泡与按钮为赤陶橙系

- **WHEN** 渲染用户消息气泡或主操作按钮
- **THEN** 用户气泡 SHALL 使用 `--color-primary`(赤陶橙)
- **AND** 执行动作的按钮 SHALL 使用 `--color-tertiary`(焦橙)
- **AND** 链接 SHALL 使用 `--color-secondary`(琥珀棕)
- **AND** 这些角色 SHALL NOT 出现任何青绿色

### Requirement: 唯一冷强调点

系统 SHALL 保留"全屏唯一强调点"的设计语汇:在整片暖黄中,`accent-warm` SHALL 是唯一的**冷色**(海事青绿),用于必须被注意的关键提醒,且 SHALL 与 `success` 绿在色相上区分。

#### Scenario: accent-warm 为冷青绿且区别于 success

- **WHEN** 某元素使用 `--color-accent-warm`
- **THEN** 该色 SHALL 为冷青绿(maritime teal)
- **AND** SHALL 与 `--color-success`(绿)在色相上明显不同,不致混淆
- **AND** 全屏同一时刻 SHALL 至多一个 accent-warm 元素(沿用既有约束)

### Requirement: 深色模式暖化

系统的深色主题 SHALL 暖化为棕黑系,取代原冷近黑。role token(primary/secondary/tertiary/accent/语义色)SHALL 在深浅模式共用同一值,组件 SHALL NOT 为深色模式重定义颜色。

#### Scenario: 深色底为暖棕黑且不重定义角色色

- **WHEN** app 运行于深色模式
- **THEN** `--color-surface-dark` 及其衍生 SHALL 为暖棕黑(非冷近黑)
- **AND** `--color-on-surface-dark` SHALL 为暖白
- **AND** primary/secondary/tertiary/accent 等 role token SHALL 沿用浅色模式的同一取值

### Requirement: PTY 终端跟随主题

PTY 终端的 xterm 主题(`src/components/Terminal.tsx` 硬编码)SHALL 与主题 token 同步:背景、前景、光标、选区跟随对应 role token;ANSI 16 色 SHALL 保持终端语义不被主题色覆盖。

#### Scenario: 终端浅色主题跟随新底色与主色

- **WHEN** 终端运行于浅色模式
- **THEN** xterm `background` SHALL 等于新的 `surface-muted` 淡黄
- **AND** xterm `cursor` SHALL 等于新的 `primary` 赤陶橙
- **AND** xterm `selectionBackground` SHALL 为赤陶橙的低透明度变体

#### Scenario: 终端深色主题暖化

- **WHEN** 终端运行于深色模式
- **THEN** xterm `background` SHALL 为暖棕黑
- **AND** xterm `foreground` SHALL 为暖白

#### Scenario: ANSI 语义色保持

- **WHEN** 终端程序输出 ANSI 颜色(red/green/blue/yellow 等)
- **THEN** 这些 ANSI 色 SHALL 保持各自的语义色相
- **AND** SHALL NOT 被主题的赤陶橙覆盖

### Requirement: 组件消费 token 工具类

组件 SHALL 通过主题 token 工具类(由 Tailwind v4 从 `@theme` 生成,如 `bg-surface`/`text-on-surface-muted`/`border-outline`/`dark:bg-surface-dark-muted`)取色,SHALL NOT 使用原生 Tailwind 调色板冷色(`gray-*` / `slate-*` / `zinc-*` / `neutral-*` / 裸 `white`)作为界面 chrome。语义状态 SHALL 用 `danger`/`success`/`warning` token(可加透明度变体)。映射见 `docs/DESIGN.md` 的 "Tailwind Utility Mapping" 表。

#### Scenario: 弱化文字用 on-surface-muted 而非冷灰

- **WHEN** 渲染次要/占位/图标等弱化文字
- **THEN** SHALL 使用 `text-on-surface-muted`(深色 `dark:text-on-canvas-dark-muted`)
- **AND** SHALL NOT 使用 `text-gray-400/500/600`

#### Scenario: 深色面跟随暖棕黑 token

- **WHEN** 组件在深色模式渲染抬升面/输入框/模态
- **THEN** SHALL 使用 `dark:bg-surface-dark-muted` / `dark:bg-surface-dark-elevated`
- **AND** SHALL NOT 使用 `dark:bg-neutral-800` 等冷 neutral

#### Scenario: 语义状态用语义 token

- **WHEN** 渲染错误/成功/警告提示
- **THEN** 文字 SHALL 用 `text-danger`/`text-success`/`text-warning`,底色用其 `/10` 透明度变体,描边用 `/30`
- **AND** SHALL NOT 使用 `red-*`/`green-*`/`amber-*` 原生调色板

### Requirement: WCAG AA 对比度

所有前景/背景配对 SHALL 满足 WCAG AA(普通文本 ≥ 4.5:1),并经 `npm run design:lint` 验证通过方可合并。

#### Scenario: 填充按钮白字达标

- **WHEN** 在 `primary` / `tertiary` / `secondary` / `accent-warm` 填充色上叠加其 `on-*` 白字
- **THEN** 对比度 SHALL ≥ 4.5:1
- **AND** `npm run design:lint` SHALL 通过

#### Scenario: 淡黄底上的文字达标

- **WHEN** 正文墨 `on-surface` 或次要字 `on-surface-muted` 落在 canvas/surface-muted/surface 任一淡黄底上
- **THEN** 对比度 SHALL ≥ 4.5:1
