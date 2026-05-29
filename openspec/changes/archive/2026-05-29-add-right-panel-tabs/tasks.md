# Tasks — add-right-panel-tabs

## 1. Remove outer header, add tab bar

- [x] Delete the `<div>` block containing "工作面板" label and its `border-b`
- [x] Add `activeTab` state (`'目录' | '信息' | '预览'`, default `'目录'`)
- [x] Render a tab bar row at the panel top with three buttons + `PanelRightClose`
      at the trailing end (replaces the collapse button's old position)
- [x] Tab button active style: white bg / shadow (light) or neutral-700 (dark),
      matching the existing capsule pattern in the codebase

## 2. Content area — conditional rendering

- [x] `目录` tab → render `<FileTree nodes={MOCK_FILE_TREE} />`
- [x] `信息` tab → render the TaskDetails metadata rows (Hash/Tag/Calendar/
      GitBranch fields) from the existing stacked layout
- [x] `预览` tab → render the Preview card + disabled action buttons, verbatim

## 3. Lint & verify

- [x] `npm run lint` passes (no new errors introduced)
- [ ] `npm run design:lint` passes (no hardcoded hex/rem)
- [ ] Manual check: collapse/re-open works; tab switch works in both light/dark
