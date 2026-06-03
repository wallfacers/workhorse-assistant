## Why

The app's corner-radius language drifted in two ways:

1. **Too large vs. the reference.** `docs/DESIGN.md` aims for "the Claude-docs
   look", but the radius scale is generous (panes `24px`, window `28px`) whereas
   the actual Claude docs site (`code.claude.com/docs`) uses a **restrained,
   small** scale. Measured live from that page (computed `border-radius` across
   the DOM):

   | radius | count | used for |
   |--------|-------|----------|
   | `6px`  | 985   | inline code, small icon containers — the dominant value |
   | `8px`  | 3     | small icon buttons |
   | `12px` | 20    | buttons (search / ai) |
   | `16px` | 76    | **containers**: code blocks (`div.code-block`), callouts/cards (`div.callout`) |
   | `9999px` | 2   | pill (send button) |

   So Claude's system is: **container 16 · button 12 · input 12 · inline 6 ·
   icon-button 8 · pill full**.

2. **Off-scale magic numbers in the chat Markdown renderer.** `src/index.css`
   hardcodes radii that are not on any token scale and whose comments are wrong:
   - code-block container `1rem` (16px) — comment says "rounded-2xl" (it is 16)
   - table outer frame `12px` — comment says "rounded.sm" (sm is 8px)
   - inline code `4px`, copy button `4px` — not on the scale at all

   The result reads as "inconsistent corners" in AI chat output.

The user's decision (captured in `design.md`): **faithfully replicate Claude's
three-tier scale**, shrink the overall rounding to match, and keep the window
root as the single exception.

## What Changes

- **Adopt Claude's measured radius scale as the project scale**:
  `inline 6 · icon-button 8 · control (button/input) 12 · container 16 · pill full`.
- **Containers collapse to one value (`16px`)** — panes, cards, message bubbles,
  code blocks, tables, callouts, modals, tooltips all use `16px`. This is the
  largest "soft" surface; there is no longer an outer-larger-than-inner tier for
  surfaces.
- **Deliberately retire the concentric-radius rule** in `docs/DESIGN.md` (panes
  `24` > cards `16` > controls `8`). It is replaced by a **role-based flat scale**.
  The "Shapes" section and the "Don't break the concentric-radius rule" guidance
  are rewritten accordingly.
- **Fix the Markdown renderer hardcoded radii** in `src/index.css`: copy button
  `4px → 8px`, inline code `4px → 6px`, table frame `12px → 16px`; code-block
  container stays `16px` (already correct). Correct the inaccurate comments.
- **Audit every `rounded-*` usage** in `src/components/*.tsx` and re-map each to
  the new role (container 16 / control 12 / inline 6 / icon 8 / pill full),
  eliminating the `rounded-[12px]` magic number.
- **Window root is the one exception**: stays `~28px` + the Windows DWM corner
  preference, because it is a physical OS-linked window edge, not an in-app surface.
- **Avatars / status dots / badges / pills stay `rounded-full`** — fully circular,
  not a corner radius.

## Capabilities

### Modified Capabilities

- `visual-theme`: add a requirement fixing the **corner-radius scale** to Claude's
  measured values and the role→radius mapping, and recording the window-root
  exception. Supersedes the previous (undocumented-as-spec) concentric-radius
  intent in `docs/DESIGN.md`.

## Impact

- **Design source:** `docs/DESIGN.md` — `rounded:` block, `components:` radius
  refs, the "Shapes" section, and the concentric-radius guidance. Re-export via
  `npm run design:export:css`.
- **Renderer CSS:** `src/index.css` — `--radius-*` vars + the Markdown
  (`[data-component="markdown*"]`) hardcoded radii.
- **Components:** `src/components/**/*.tsx` — ~128 `rounded-*` usages re-mapped by
  role; remove `rounded-[12px]`.
- **Gates:** `npm run design:lint` and `npm run lint` stay green; a visual pass on
  chat output (code blocks, tables, inline code) and on panes/cards/buttons.
- **No behavior, data, or API change.** Purely visual.
