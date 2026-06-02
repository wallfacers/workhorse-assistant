# Tasks — 暖淡黄主题重塑

## 1. 设计源 docs/DESIGN.md(真源)

- [x] 1.1 改写 `colors:` 块浅色 token:`neutral`→#F4ECC8、`surface-muted`→#FAF3D8、`surface`→#FFFDF2、`on-surface`→#241C10、`on-surface-muted`→#8A7A55、`outline`→#EFE6C4
- [x] 1.2 改写灵魂色:`primary`→#B8422E、`primary-container`→#C2682E、`on-primary-container`→#FFF1E6、`secondary`→#A85420、`tertiary`→#9A3B12
- [x] 1.3 翻转 `accent-warm`→#0B6477(海事青绿,唯一冷强调);`danger`→#B3261E(与主色拉开)
- [x] 1.4 改写深色 token:`surface-dark`→#1A1510、`on-surface-dark`→#ECE4D2、`on-surface-dark-muted`→#A89A7E、`surface-dark-muted`→#241D14、`outline-dark`→#3A2F20(并补 elevated #2C2418)
- [x] 1.5 重写 Overview / Colors 叙事:把"海事/深青"改为"暖纸/赤陶橙";说明 accent-warm 现为唯一冷青绿点

## 2. 运行时 token src/index.css @theme

- [x] 2.1 逐一镜像 1.1–1.4 的所有 `--color-*` 值,与 DESIGN.md 对齐(含 canvas-dark/on-canvas-dark/on-canvas-dark-muted/surface-dark-elevated)
- [x] 2.2 改 markdown 链接深色态 `#4dd0e1`→#E0A060(约 334 行)
- [x] 2.3 改引用块左边框:浅 `rgb(2 74 68 /.4)`→`rgb(184 66 46 /.4)`、深 `#4dd0e1`→#E0A060(约 352–355 行)
- [x] 2.4 (可选)暖化 custom-scrollbar 的 tailwind 灰阶(gray→stone)

## 3. PTY 终端 src/components/Terminal.tsx

- [x] 3.1 LIGHT_THEME:`background`→#FAF3D8、`foreground`→#241C10、`cursor`→#B8422E、`cursorAccent`→#FAF3D8、`selectionBackground`→#B8422E33
- [x] 3.2 DARK_THEME:`background`→#1F1813、`foreground`→#ECE4D2、`cursor`→#C2682E、`selectionBackground`→#C2682E55
- [x] 3.3 (可选)LIGHT 滚动条滑块 `#d1d5db`→#DCCE9E
- [x] 3.4 在主题常量上加注释,标注每个值对应的 token 名(防日后漂移)
- [x] 3.5 ANSI 16 色保持不变(确认未被误改)

## 4. 验证与门禁

- [x] 4.1 ~~`npm run design:export:css` 重新导出~~ → 脚本上游损坏(格式 css-tailwind 不存在)且生成文件废弃/gitignore/未 import,运行时真源为 index.css @theme,无需导出。详见 design.md 同步链注释。
- [x] 4.2 `npm run design:lint` 通过(0 errors);修复了 button-primary-hover 对比度(primary-container #C2682E→#A8521A,3.57:1→~4.9:1)
- [x] 4.3 `npm run lint` 通过(tsc --noEmit 无错)
- [x] 4.4 playwright 截图复校:浅色暖黄外壳+暖白面 ✅、深色暖棕黑 ✅、live token 全部正确(primary #b8422e / canvas #f4ecc8 / accent-warm #0b6477)✅、无相关 console 错误(仅 favicon 404)
- [x] 4.5 终端浅色底=#faf3d8 淡黄 ✅;深色经真主题开关跟随(注:DOM 强切 .dark 不触发 xterm 的 React isDark,需用 app 开关)
- [ ] 4.6 (新发现)组件层原生 Tailwind 冷色长尾:~290 处 text-gray-*、~100 处 dark:bg-neutral-* / border-neutral-*、~50 处 bg-gray-50/100/200 绕过 token,在暖主题下显冷。SettingsModal(217)/AgentRail(97)/RightPanel(85)/MainChat(82) 为重灾区。详见下方决策。

## 6. 组件层冷色清扫(按 DESIGN.md "Tailwind Utility Mapping" 规范)

- [ ] 6.0 在 DESIGN.md 落地映射表 + Don't 条目;在 spec 增 "组件消费 token 工具类" Requirement
- [x] 6.1 SettingsModal.tsx 清零
- [x] 6.2 AgentRail.tsx(含 CTA 按钮→bg-tertiary、placeholder、用户气泡 pink→primary/10) + Tooltip.tsx(反色气泡→surface-dark-elevated)
- [x] 6.3 RightPanel.tsx + FileTree.tsx(文件夹 amber→warning)
- [x] 6.4 MainChat.tsx(用户气泡 pink→primary/10、冷蓝高亮→secondary、placeholder) + ToolCallBlock + ReasoningPart + MessageActionBar
- [x] 6.5 TaskListModal + TitleBar(关闭键→hover:bg-danger) + SessionHeader + Modal
- [x] 6.6 ProjectBrowser(文件夹 amber→warning) + TabBar + ErrorBoundary(→danger) + App + TerminalWorkspace + PaneCard
- [x] 6.7 全局复核:raw 冷色清零,仅剩 4 处头像彩虹渐变(有意保留);`tsc`✅ + `design:lint` 0 errors✅;playwright 浅(docs 奶油)/深(暖近黑)双模式复校✅,终端经真开关正确跟随✅

## 5. 收尾

- [x] 5.1 grep 残留青绿硬编码确认:仅剩有意保留处 —— accent-warm 的 #0B6477、ANSI 语义色 blue #144272 / cyan #0B6477、on-* 白字
- [ ] 5.2 提交;归档本 change(`openspec archive`) —— 待用户确认
