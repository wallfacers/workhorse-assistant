# Design — 暖淡黄主题重塑

## 决策记录

| # | 决策 | 取舍 |
|---|------|------|
| D1 | 走"完整复刻 Claude 文档风"(方案 B),而非只暖化背景 | 用户明确要"参考官网" + "都得改"。代价:推翻 DESIGN.md 的"海事"叙事。 |
| D2 | 黄取**极淡暖奶油**(canvas `#F0EFEA` / surface `#FDFDF7`),贴近 Claude docs 实测值 | 初版 `#F4ECC8` 实机偏黄过头,用户要求"和 docs 一样"。抓取 code.claude.com 实测:`--background-light: #FDFDF7`、secondary `#F0EFEA`、dark surface `#1A1918`、accent `#CB785C`。改为暖意极淡、几乎中性的奶油。 |
| D3 | 主色取 `#B8422E`(深赤陶),非官网亮橙 `#D97757` | 官网亮橙配白字仅 ~2.6:1 不达 AA;压深到 `#B8422E` 得 ~7:1。视觉更"沉"但合规。 |
| D4 | `accent-warm` 翻为退役的海事青绿 `#0B6477` | 整屏变暖后"唯一暖点"角色失效;改用冷青绿做唯一冷强调,且与 `success` 绿区分。海事色以此方式留存。 |
| D5 | 深色模式一并暖化(棕黑系),但**不**为深色重定义 role token | 遵守 DESIGN.md "组件不为暗色重定义颜色"。仅暖化 `surface-dark*` / `outline-dark` / `on-*-dark` 这几个本就分浅深的 token。 |
| D6 | PTY 终端手动同步,不抽象成读 CSS 变量 | xterm 主题是 JS 对象,运行时按 `isDark` 切换;改硬编码常量最简单可靠,留注释指向 token 来源。 |

## 浅色模式色板(明确淡黄 + 赤陶橙)

```
角色                旧值              新值       用途                    白字AA
canvas              #ECEFF2  冷灰  →  #F4ECC8   app 外壳地面             —(深字)
surface-muted       #F4F6F8  冷灰  →  #FAF3D8   主聊天区底               —(深字)
surface             #FFFFFF  纯白  →  #FFFDF2   卡片/侧栏/右栏/助手气泡   —(深字)
on-surface          #101012  冷黑  →  #241C10   正文墨                   —
on-surface-muted    #6B7280  冷灰  →  #8A7A55   次要字/语言标签          —
outline             #E5E7EB        →  #EFE6C4   细描边/分隔线            —
outline-strong      #C4CCD3  冷灰  →  #DCCE9E   强描边                   —

primary             #024A44  深青  →  #B8422E   用户气泡/主肯定          ~7:1  ✅
on-primary          #FFFFFF        →  #FFFFFF
primary-container   #0B6477        →  #C2682E   primary hover/分隔线hover ~4.6:1 ✅
on-primary-container#E6F1F2        →  #FFF1E6
secondary           #0B6477  中青  →  #A85420   链接/markdown 链接(浅)   ~5.1:1 ✅(底为淡黄)
on-secondary        #FFFFFF        →  #FFFFFF
tertiary            #144272  navy  →  #9A3B12   CTA 按钮(button-primary) ~6.5:1 ✅
on-tertiary         #FFFFFF        →  #FFFFFF
accent-warm         #B8422E  橙    →  #0B6477   唯一冷强调(关键提醒)     ~5.8:1 ✅
on-accent-warm      #FFFFFF        →  #FFFFFF

success             #1F7A5A        →  #1F7A5A   不变(与 accent 青绿区分)
warning             #B4731B        →  #B4731B   不变(琥珀,本就契合暖调)
danger              #A6342B        →  #B3261E   略偏纯红,与主色赤陶橙拉开(见风险R1)
```

## 深色模式色板(暖化近黑)

```
角色                    旧值       新值       用途
surface-dark            #101012  → #1A1510   暗色 app 地面(暖棕黑)
on-surface-dark         #ECEFF2  → #ECE4D2   暗色正文(暖白)
on-surface-dark-muted   #9CA3AF  → #A89A7E   暗色次要字(暖灰)
surface-dark-muted      #1A202C  → #241D14   暗色主聊天底/代码块容器
surface-dark-elevated   #1E1E22  → #2C2418   暗色抬升面
outline-dark            #2A2F36  → #3A2F20   暗色描边
canvas-dark             #101012  → #1A1510   (= surface-dark)
on-canvas-dark          #ECEFF2  → #ECE4D2
on-canvas-dark-muted    #9CA3AF  → #A89A7E
```

> role token(primary/secondary/tertiary/accent/语义色)在深浅模式**共用同一值**,遵守 DESIGN.md "组件不为暗色重定义颜色"。赤陶橙 `#B8422E` 在暖棕黑底上对比足够。

## PTY 终端色板(`src/components/Terminal.tsx` 硬编码,需手动同步)

```
LIGHT_THEME
  background          #f4f6f8  → #FAF3D8   (= 新 surface-muted)
  foreground          #101012  → #241C10   (= 新 on-surface)
  cursor              #0b6477  → #B8422E   (= 新 primary 赤陶橙)
  cursorAccent        #f4f6f8  → #FAF3D8   (= 新 surface-muted)
  selectionBackground #0b647733→ #B8422E33 (赤陶橙 20%)
  ANSI 16 色          保持不变 —— red/green/blue 等是终端语义色,非主题色
  (white #5b6470 可选暖化为 #7A7058,优先级低)

DARK_THEME
  background          #161618  → #1F1813   (暖棕黑,比 surface-dark 略亮一档)
  foreground          #eceff2  → #ECE4D2   (= 新 on-surface-dark)
  cursor              #0b6477  → #C2682E   (暖橙,暗底上更亮)
  selectionBackground #0b647755→ #C2682E55

滚动条滑块常量(LIGHT_THEME_SCROLLBAR / DARK_THEME_SCROLLBAR)
  light slider #d1d5db 冷灰  → #DCCE9E (暖描边色) 可选
  dark  slider #525252      → 维持中性灰即可
```

## 散落硬编码(`src/index.css`)

```
markdown 链接(浅)   color: var(--color-secondary)        ← 自动跟随 ✅(无需改)
markdown 链接(深)   #4dd0e1 青  → #E0A060 暖琥珀          ← 需改
引用块左边框(浅)    rgb(2 74 68 /.4) 青绿 → rgb(184 66 46 /.4) 赤陶橙
引用块左边框(深)    #4dd0e1 青  → #E0A060
分隔线 hover        var(--color-primary-container)        ← 自动跟随 ✅
agent-star settle   var(--color-primary)                  ← 自动跟随 ✅(彩虹关键帧为装饰,保留)
custom-scrollbar    bg-gray-300/neutral-600(tailwind)     ← 可选暖化,优先级低
```

## 真源 → 运行时的同步链

```
docs/DESIGN.md (colors: 真源)
   │  手工镜像(当前 @theme 非自动生成)
   └─→ src/index.css @theme { --color-* }   ← 运行时真源,必须逐一对齐

src/components/Terminal.tsx  ← 独立手工同步(不读 CSS 变量)

⚠️ src/design-tokens.generated.css 是废弃产物:被 .gitignore 忽略、从未提交、
   index.css 也未 import 它。且 package.json 的 `design:export:css` 脚本指向
   `--format css-tailwind`,而 design.md CLI v0.1.1 只支持 `tailwind`/`dtcg`(均非
   纯 CSS),脚本恒报错。故本次不导出该文件;运行时真源是 index.css @theme。
   若日后要接入自动生成,需先修脚本格式并把生成文件 import 进 index.css。
```

## 风险

- **R1 — 主色赤陶橙 `#B8422E` 与 danger 红相邻。** 缓解:danger 偏纯红 `#B3261E`(hue 更红),主色偏橙(hue ~12°);且 danger 仅用于破坏性语义,语境本就不同。仍需在真机扫一眼二者不混淆。
- **R2 — 明确淡黄底上的次要灰字 `on-surface-muted #8A7A55` 对比度。** 在 `surface #FFFDF2` 上约 4.6:1 勉强过 AA;在更深的 `canvas #F4ECC8` 上会更紧。`design:lint` 会卡;若不过则压深到 `#7A6A48`。
- **R3 — DESIGN.md 叙事与代码脱节。** Overview 写满"海事/深青",必须同改,否则规范与实现互相矛盾(CLAUDE.md:真源原则)。
- **R4 — 终端与 token 漂移。** 终端硬编码独立于 token,日后改 token 易忘同步终端。缓解:在 `Terminal.tsx` 主题常量上加注释,标注每个值对应的 token 名。
