# visual-theme Delta Spec

## ADDED Requirements

### Requirement: DESIGN.md 声明所有运行时 token 并纳入导出管线

`docs/DESIGN.md` 的 `colors:` 块 SHALL 声明所有在 `src/index.css` 中使用且被组件引用的 token。新增 token SHALL 同时出现在 `components:` 块中以避免 orphaned 警告。`npm run design:export:css` SHALL 输出包含新 token 的 `src/design-tokens.generated.css`。

#### Scenario: outline-strong 纳入 DESIGN.md 与导出管线

- **WHEN** 检查 `docs/DESIGN.md`
- **THEN** `colors:` 块 SHALL 包含 `outline-strong: "#D6D2C6"`
- **AND** `components:` 块 SHALL 包含引用 `outline-strong` 的条目（如按钮/输入框 focus ring）
- **AND** `npm run design:export:css` 输出的 CSS SHALL 包含 `--color-outline-strong: #D6D2C6`

#### Scenario: canvas-dark 纳入 DESIGN.md 与导出管线

- **WHEN** 检查 `docs/DESIGN.md`
- **THEN** `colors:` 块 SHALL 包含 `canvas-dark: "#111110"`
- **AND** `components:` 块 SHALL 包含引用 `canvas-dark` 的条目（如 app shell 底色）
- **AND** `npm run design:export:css` 输出的 CSS SHALL 包含 `--color-canvas-dark: #111110`

#### Scenario: surface-dark-elevated 纳入 DESIGN.md 与导出管线

- **WHEN** 检查 `docs/DESIGN.md`
- **THEN** `colors:` 块 SHALL 包含 `surface-dark-elevated: "#272420"`
- **AND** `components:` 块 SHALL 包含引用 `surface-dark-elevated` 的条目（如模态框/弹出层深色表面）
- **AND** `npm run design:export:css` 输出的 CSS SHALL 包含 `--color-surface-dark-elevated: #272420`

#### Scenario: design:lint 不因新增 token 而退化

- **WHEN** 运行 `npm run design:lint`
- **THEN** errors SHALL 保持 0
- **AND** orphaned warnings SHALL NOT 因新增 token 而增加（token 在 `components:` 中有引用）
