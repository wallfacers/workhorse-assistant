## Why

当前主题是 **海事深青绿（teal）配冷中性画布**:三个底色 token 偏冷灰白(`--color-canvas #ECEFF2` / `--color-surface-muted #F4F6F8` / `--color-surface #FFFFFF`),灵魂色是深青绿(`primary #024a44` / `secondary #0b6477` / `tertiary #144272`)。

需求是把这套换成 **Claude 文档官网风格的暖淡黄主题**(参考 https://code.claude.com/docs/en/overview):底色翻成明确的淡黄,灵魂色从深青绿翻成 Claude 标志性的**赤陶橙(terracotta)系**,深色模式也一并暖化。

关键约束:**PTY 终端不吃 CSS token** —— `Terminal.tsx` 把 xterm 主题硬编码(`LIGHT_THEME.background = '#f4f6f8'`、`cursor = '#0b6477'` 等),所以"全都改"必须单独同步终端那套色板,否则终端会和新主题脱节。

> 项目处于 alpha 阶段(`docs/DESIGN.md` version: alpha),**不保留旧配色**。这是一次彻底的视觉重塑,而非加开关切换。

## What Changes

- **重写设计 token 源 `docs/DESIGN.md`**:`colors:` 块从冷灰/青绿翻成暖黄/赤陶橙(浅色+深色两套),并重写 Overview/Colors 的"海事"叙事为"暖纸/赤陶"叙事。DESIGN.md 是真源。
- **镜像到运行时 `src/index.css` 的 `@theme` 块**:手工同步与 DESIGN.md 一致的 token(当前 @theme 是手工镜像,非自动生成),并刷新 `design-tokens.generated.css`。
- **`accent-warm` 角色翻转**:原 `accent-warm`(#B8422E 赤陶橙)升级为新主色后,"全屏唯一暖点"的角色空出 —— 改由退役的**海事青绿 `#0B6477`** 充当,作为一片暖黄中唯一的冷强调(错误/关键提醒)。与 `success` 绿区分开。
- **同步 PTY 终端色板**:`Terminal.tsx` 的 `LIGHT_THEME` / `DARK_THEME` 的 `background` / `foreground` / `cursor` / `cursorAccent` / `selectionBackground` / 滚动条滑块色,跟随新 token;ANSI 16 色保持语义不变(red/green/blue 仍是各自的色)。
- **清理散落硬编码**:`index.css` 里 markdown 链接深色态青色 `#4dd0e1`、引用块青绿左边框等,改为跟随新主题(暖琥珀)。
- **WCAG 复校**:填充按钮白字、链接在淡黄底上的对比度全部过 `npm run design:lint`(AA ≥ 4.5:1)。Claude 官网那个亮橙 `#D97757` 配白字不达标,故主色压深到 `#B8422E`。

## Capabilities

### New Capabilities
- `visual-theme`: 应用的视觉主题契约 —— 暖淡黄底 + 赤陶橙强调色板(浅色/深色两套)、role token 的语义、PTY 终端色板与 token 的同步关系、WCAG AA 门槛。

## Impact

- **设计源**:`docs/DESIGN.md` `colors:` 块全量改写;Overview/Colors 叙事重写。
- **运行时 token**:`src/index.css` 的 `@theme` 块手工镜像;`src/design-tokens.generated.css` 重新导出。
- **PTY 终端**:`src/components/Terminal.tsx` 的 `LIGHT_THEME` / `DARK_THEME` / 滚动条主题常量改色。
- **散落硬编码**:`src/index.css` 内 markdown 链接/引用块的青色硬编码改为暖色。
- **门禁**:`npm run design:lint`(对比度) + `npm run lint`(类型) 必须通过。
- **不变**:绝大多数组件吃 `var(--color-*)` token,改 token 即自动跟随,无需逐个组件改类名;radius/spacing/字体不动;不新增阴影;不引入第二个字体。
