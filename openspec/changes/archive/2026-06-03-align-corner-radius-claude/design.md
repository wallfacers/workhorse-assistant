# Design — align-corner-radius-claude

## Context

Goal stated by the user: "把项目里所有组件的圆角幅度,和 Claude 文档站统一,AI 对话
markdown 渲染部分也一样。" Explore-mode investigation resolved this into a concrete,
measured target rather than a guess.

The reference (`code.claude.com/docs/en/settings`) could not be read via WebFetch
(Mintlify serves Markdown; CSS is not in the body). It was instead **measured live
with a headless browser** (computed `border-radius` over the full DOM). Findings:

```
 6px  ×985  inline code, small icon containers   ← dominant "small"
 8px  ×3    small icon buttons
12px  ×20   buttons (search / ai)
16px  ×76   containers: code-block, callout/card
9999  ×2    pill (send button)
```

## Decisions

### D1 — Adopt Claude's three-tier scale verbatim (not a single value)

The user initially asked for "one radius for everything", then chose to **match
Claude exactly** once it was shown Claude itself uses a small multi-tier scale.
Final scale:

| role | radius | applies to |
|------|--------|------------|
| inline | `6px` | inline code |
| icon-button | `8px` | small icon buttons (e.g. code-block copy button) |
| control | `12px` | buttons, inputs, chips |
| container | `16px` | panes, cards, message bubbles, code blocks, tables, callouts, modals, tooltips |
| pill | `full` | avatars, status dots, badges, pills |
| window | `~28px` (exception) | window root only |

**Why three tiers, not one:** a literal single value contradicts the reference.
Faithful replication is what "和 Claude 一致" means. Visually it still reads as
"unified" because every *surface/container* lands on the same `16px`; only
controls (12) and inline atoms (6/8) differ — exactly as on Claude.

### D2 — Retire the concentric-radius rule

`docs/DESIGN.md` currently mandates a monotonic concentric scale (outer > inner:
panes 24 > cards 16 > controls 8) and forbids breaking it. The new scale
**intentionally flattens all containers to 16px**, so panes == cards == code
blocks. The rule is therefore replaced, not violated silently:

- "Shapes" section rewritten to the role table in D1.
- The "Don't break the concentric-radius rule" line is removed; a new note
  explains containers share one radius by design (matching Claude).

Trade-off accepted: a 16px card sitting inside a 16px pane has equal corners. On
Claude this is fine because panes are mostly full-bleed and cards rarely nest
directly corner-to-corner; the project's three panes have a 14px gap between them,
so concentric nesting is not visually prominent.

### D3 — Window root is the single exception

The frameless window root keeps `~28px` and the Windows DWM corner preference
(`round_window_corners` in `src-tauri/src/lib.rs`). Rationale: it is a physical
OS-linked window edge, not an in-app surface; DWM only offers Round/RoundSmall,
not arbitrary px, so forcing it to 16 would risk a mismatch between the renderer
clip and the OS region. Left unchanged.

### D4 — Token strategy in DESIGN.md / index.css

`docs/DESIGN.md` `rounded:` currently: `none 0 · sm 8 · md 16 · lg 24 · xl 28 ·
full 9999`. Re-map to the role scale. Proposed token names (keep the existing
keys where the value matches so the generated CSS churn is minimal):

```
rounded:
  none:    0px
  inline:  6px     # new — inline code
  icon:    8px     # was sm
  control: 12px    # new — buttons / inputs
  container: 16px  # was md
  window:  28px    # was xl — window root only (exception)
  full:    9999px
```

`lg (24px)` is dropped (was panes; panes → container 16). `components:` entries
re-point: panes `lg → container`, cards/bubbles stay `container`, buttons/inputs
`sm → control`, copy/icon buttons `→ icon`, badges stay `full`. Re-export with
`npm run design:export:css`. `src/index.css` `--radius-*` vars align to the same
values.

> Note: renaming token keys touches the generated Tailwind utilities. Confirm the
> exporter emits utilities the components can consume (e.g. `rounded-container`,
> `rounded-control`) OR keep Tailwind's stock `rounded-*` names mapped to the new
> values — pick whichever keeps `src/components/*.tsx` churn lowest during apply.

### D5 — Markdown renderer (src/index.css) hardcoded fixes

| line (approx) | element | now | → |
|---------------|---------|-----|---|
| ~243 | code-block container | `1rem` (16) | `16px` (unchanged; fix comment) |
| ~285 | copy button (icon) | `0.25rem` (4) | `8px` |
| ~347 | inline code | `4px` | `6px` |
| ~362 | table outer frame | `12px` | `16px` (fix comment: not "rounded.sm") |

### D6 — Component `rounded-*` audit

~128 usages across `src/components/**`. Each must be judged by *role*, not blindly
swapped, because the same class (`rounded-lg`) is used for both panes and smaller
chrome today. Rule: container → 16, button/input/chip → 12, inline atom → 6, small
icon button → 8, circle/pill → full. Eliminate the lone `rounded-[12px]` magic
number (becomes a control/container token as appropriate).

## Risks / Open Questions

- **Token-name churn vs. Tailwind stock names** (see D4 note) — decide at apply
  time which keeps component diffs smallest.
- **24px → 16px on panes is a visible shrink.** Intended, but worth a quick visual
  confirm that panes still read as distinct cards against the canvas.
- **`design:lint`** may or may not validate radius tokens; confirm it stays green
  after the `rounded:` key rename.
