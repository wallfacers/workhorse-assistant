## 1. Summary row 轻量化

- [x] 1.1 移除 details 外层容器的 `rounded-md border border-outline/40 dark:border-neutral-700/50 bg-surface-muted/60 dark:bg-neutral-800/40`，仅保留 `my-1.5`
- [x] 1.2 移除 summary hover 的 `rounded-md`（summary 不再需要独立圆角），保留 `hover:bg-gray-100/60 dark:hover:bg-neutral-800/60`

## 2. 工具名 Badge 化

- [x] 2.1 在 summary 行内，将纯 `<span className="font-mono font-medium">` 替换为 badge pill：`bg-secondary/10 text-secondary dark:bg-secondary/20 dark:text-[#5bb5cc] rounded-sm border border-secondary/20 dark:border-secondary/30`，保留 `font-mono font-medium text-[11px]`
- [x] 2.2 在 badge 内工具名左侧添加 `Wrench` 图标（Lucide），`w-3 h-3`

## 3. 展开区域独立化

- [x] 3.1 将 Input/Output pre 块容器从细节区域拆出，包裹在独立卡片样式中：`rounded-sm border border-outline/30 dark:border-neutral-700/40 bg-white dark:bg-neutral-900`
- [x] 3.2 展开区域添加左侧缩进，与 badge 视觉对齐（`ml-5`）

## 4. 验证

- [x] 4.1 `npm run lint` 类型检查通过
- [ ] 4.2 目视验证浅色/深色两种主题下 badge 和 summary 行样式正确
