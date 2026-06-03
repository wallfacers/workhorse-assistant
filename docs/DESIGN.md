---
version: alpha
name: Workhorse
description: >-
  Quiet, focused, working surface. Warm terracotta against a cream paper
  canvas (the Claude-docs look). Built for long sessions of thinking with an agent.
colors:
  primary: "#B8422E"
  on-primary: "#FFFFFF"
  primary-container: "#A8521A"
  on-primary-container: "#FFF1E6"
  secondary: "#A85420"
  on-secondary: "#FFFFFF"
  tertiary: "#9A3B12"
  on-tertiary: "#FFFFFF"
  neutral: "#F0EFEA"
  on-neutral: "#1A1918"
  surface: "#FDFDF7"
  on-surface: "#1A1918"
  on-surface-muted: "#6E6A60"
  surface-muted: "#F7F6F1"
  surface-dark: "#1A1918"
  on-surface-dark: "#ECEAE3"
  on-surface-dark-muted: "#9C968A"
  surface-dark-muted: "#201F1C"
  outline: "#E6E3DA"
  outline-dark: "#2E2C28"
  accent-warm: "#0B6477"
  on-accent-warm: "#FFFFFF"
  success: "#1F7A5A"
  warning: "#B4731B"
  danger: "#B3261E"
typography:
  display:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: 3rem
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: -0.02em
  h1:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: 2rem
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.015em
  h2:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: 1.5rem
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: -0.01em
  h3:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: 1.125rem
    fontWeight: 600
    lineHeight: 1.3
  body-md:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.55
  body-sm:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: 0.875rem
    fontWeight: 400
    lineHeight: 1.5
  label-caps:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: 0.6875rem
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: 0.08em
    textTransform: uppercase
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, 'JetBrains Mono', Consolas, monospace"
    fontSize: 0.875rem
    fontWeight: 400
    lineHeight: 1.55
rounded:
  none: 0px
  xs: 6px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 28px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 48px
  3xl: 64px
components:
  app-shell:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.on-neutral}"
    rounded: "{rounded.xl}"
    padding: 14px
  app-shell-dark:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.on-surface-dark}"
    rounded: "{rounded.xl}"
    padding: 14px
  sidebar:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.lg}"
    padding: 16px
  main-chat:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.lg}"
    padding: 24px
  right-panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.lg}"
    padding: 16px
  message-bubble-user:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.lg}"
    padding: 12px
  message-bubble-assistant:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.lg}"
    padding: 12px
  button-primary:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.on-tertiary}"
    rounded: "{rounded.md}"
    padding: 10px
  button-primary-hover:
    backgroundColor: "{colors.primary-container}"
    textColor: "{colors.on-primary-container}"
  button-ghost:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.md}"
    padding: 10px
  input-text:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.md}"
    padding: 10px
  badge-accent:
    backgroundColor: "{colors.accent-warm}"
    textColor: "{colors.on-accent-warm}"
    rounded: "{rounded.full}"
    padding: 4px
---

## Overview

**Workhorse** is the visual identity for a focused, long-session AI assistant.
The aesthetic borrows from warm paper and terracotta — a cream off-white ground
with burnt-clay accents, echoing the Claude documentation look — rather than
the cold neon of most chat UIs. The goal is a surface you can stare at for an
hour without flinching.

Two emotional anchors:

- **Quiet capability.** The chrome stays out of the way. Strong contrast and
  generous whitespace do the work; no decorative gradients in the working area.
- **Warm terracotta.** Burnt-clay terracotta (`primary` / `secondary` /
  `tertiary`) is the brand voice — it lives *in* the working surface (buttons,
  the user's own message bubbles, active accents), never as a page backdrop.
  The window is frameless and paints a single quiet `surface-muted` cream
  ground; there is no gradient frame.

Dark mode warms the canvas to a brown-black ink (`surface-dark`) but keeps the
exact same token roles. Components do **not** redefine colors for dark mode;
they consume role tokens.

## Colors

The palette is a small set of role-named tokens. Components never hard-code
hexes — they consume `{colors.*}` references.

- **`primary` (#B8422E):** Deep terracotta. Anchor color for the user's own
  voice (message bubbles, primary affirmations). Deepened from the brighter
  Claude orange so white text on it clears WCAG AA.
- **`secondary` (#A85420):** Amber-brown. Hover/active state for primary, and
  the link color in body copy.
- **`tertiary` (#9A3B12):** Burnt orange. The call-to-action color — every
  button that *does* a thing wears this.
- **`neutral` (#F0EFEA):** Warm off-white cream canvas (the Claude-docs ground).
  The outermost working surface; the warmth is subtle, not a saturated yellow.
- **`surface` (#FDFDF7):** Near-white warm cream. Cards and panels that sit on
  the canvas (the brightest step of the ladder).
- **`surface-muted` (#F7F6F1):** The main chat area background; a mid cream,
  quieter than `surface` so messages float on top with clear figure/ground.
- **`surface-dark` / `surface-dark-muted`:** Warm near-black (#1A1918, the
  Claude-docs dark surface) dark-mode equivalents of `neutral` / `surface-muted`.
- **`accent-warm` (#0B6477):** The one **cold** note in an otherwise warm
  palette — maritime teal, the retired brand color kept as the single
  attention accent (critical alerts). Distinct in hue from `success` green.
  Use sparingly — a single accent on screen at a time.

Semantic colors (`success` / `warning` / `danger`) are role-fixed and survive
dark mode without restating them.

### Contrast

All `*-on-*` pairings meet **WCAG AA** (≥ 4.5:1). Any new component that
introduces a foreground/background pair MUST be checked with
`npm run design:lint` before merge.

## Typography

A single sans-serif family (`Inter` with a system fallback) carries every
weight from caption to display. Monospace (`mono`) is reserved for code,
hashes, IDs, and the assistant's tool-call previews.

- **Use `display` only for the empty-state hero.** Inside chat there is no
  use case for it.
- **Use `label-caps` only on metadata** (timestamps, tags, status). The
  uppercase tracking is the visual signal that the text is not narrative.
- Body line-height is intentionally generous (1.55) — chat is read in long
  sittings.

## Layout

- **Frameless window:** the app fills the OS window edge-to-edge — no outer
  padding, no gradient frame. The window is **transparent**; while floating
  (not maximized/fullscreen) the renderer rounds the root with `rounded-xl` so
  the area outside the radius reveals the desktop — real rounded corners with no
  frame. A borderless window is *not* auto-rounded by Windows 11 DWM, so on
  Windows the app also opts the OS window region into rounded corners via the
  DWM corner preference (`round_window_corners` in `src-tauri/src/lib.rs`); on
  Linux/WSL the transparent surface alone produces the rounding. The root goes
  flush and square when the OS reports the window maximized or fullscreen.
- **Inner shell padding:** `14px` (≈ `{spacing.sm}` × 1.75). The three panes sit
  directly on the `surface-muted` ground with a `14px` gap, tight enough that
  they read as one object.
- **Pane gap:** `14px`. Same as inner padding so the rhythm is consistent.
- **Max width:** `1780px`. Above that the shell stops growing; the maritime
  gradient takes the slack.
- **Three-pane structure:** sidebar (narrow) · main chat (flex) · right panel
  (narrow). Right panel is optional and may be hidden at small breakpoints.

## Elevation & Depth

Workhorse has **two elevation levels**, no more.

- **0 — flat.** Default for everything inside the shell. No shadow.
- **1 — the window itself.** The OS draws the frameless window's drop shadow
  (`shadow: true` in `tauri.conf.json`); the renderer adds none. This conveys
  "the app is a physical card on a desk."

Do **not** add per-component shadows. Use a 1px outline (`outline` / `outline-dark`)
to separate surfaces of the same elevation.

## Shapes

The radius language is a **flat, role-based scale** that replicates the Claude
docs site (`code.claude.com/docs`), measured live from its computed
`border-radius`: containers `16px`, controls `12px`, inline `6px`, small icon
buttons `8px`, pills `full`. Containers all share **one** radius — there is no
longer an outer-larger-than-inner tier for in-app surfaces.

- **Window corners (the one exception):** the floating window is rounded — the
  renderer rounds the root (`rounded-xl`, `{rounded.xl}` = 28px) over the
  transparent surface, with Windows 11 also rounding the OS window region (DWM
  corner preference) so the corners are truly clipped. Flush/square when
  maximized or fullscreen. The window keeps its larger radius because it is a
  physical OS-linked window edge, not an in-app surface.
- **Containers — panes, cards, message bubbles, code blocks, tables, modals,
  popovers/menus, callouts, tooltips:** `{rounded.lg}` (16px).
- **Controls — buttons, inputs, chips, list/menu rows, segmented tabs:**
  `{rounded.md}` (12px).
- **Inline code:** `{rounded.xs}` (6px).
- **Small icon buttons (icon-only):** `{rounded.sm}` (8px).
- **Avatars / status dots / badges / pills:** `{rounded.full}`.

> The previous concentric rule (outer always larger than inner) is intentionally
> retired. Containers now share one radius by design, matching Claude. The only
> shape that sits outside the scale is the window root (above).

## Components

The `components:` block at the top is the contract. Each entry maps a
component slug to its visual tokens. The renderer consumes these via the
exported CSS variables (`npm run design:export:css`).

Variants are sibling entries (e.g. `button-primary` / `button-primary-hover`).
Adding a new component requires:

1. A new `components.<slug>` entry here.
2. A matching Tailwind class composition in `src/components/`.
3. Both `npm run design:lint` and `npm run lint` passing.

## Tailwind Utility Mapping (no raw grays)

Components MUST consume **token utilities** (generated by Tailwind v4 from the
`@theme` block), never raw Tailwind palette colors (`gray-*`, `slate-*`,
`zinc-*`, `neutral-*`, bare `white`). Raw palette colors are cold and do not
follow the warm paper/terracotta theme. Use this table; opacity variants
(`/40`, `/10`) are allowed.

| Intent | Raw (forbidden) | Token utility (use this) |
|--------|-----------------|--------------------------|
| Lightest card/panel bg | `bg-white` | `bg-surface` |
| Subtle panel / input / hover wash | `bg-gray-50` `bg-gray-100` | `bg-surface-muted` |
| Recessed ground (deepest) | `bg-gray-200` | `bg-canvas` |
| Body / heading text | `text-gray-700/800/900` | `text-on-surface` |
| Muted / secondary / placeholder / icon | `text-gray-400/500/600` | `text-on-surface-muted` |
| Hairline border / divider | `border-gray-200` `border-gray-300` | `border-outline` |
| Stronger border / focus ring | `ring-gray-300` `border-gray-300` | `border-outline-strong` / `ring-outline-strong` |
| Selected / active brand state | `border-gray-800` | `border-primary` (terracotta) |
| Text on a colored/dark fill | — | `text-white` is OK only here |
| **Dark** surface (recessed) | `dark:bg-neutral-900` | `dark:bg-surface-dark` |
| **Dark** surface (raised/input) | `dark:bg-neutral-800` | `dark:bg-surface-dark-muted` |
| **Dark** surface (modal/elevated) | `dark:bg-neutral-800` | `dark:bg-surface-dark-elevated` |
| **Dark** body text | `dark:text-gray-100/200` | `dark:text-on-canvas-dark` |
| **Dark** muted text | `dark:text-gray-300/400/500` | `dark:text-on-canvas-dark-muted` |
| **Dark** border | `dark:border-neutral-700/800` | `dark:border-outline-dark` |
| Error/danger (text, tint bg, border) | `text-red-700` `bg-red-50` `border-red-200` | `text-danger` `bg-danger/10` `border-danger/30` |
| Success (text, tint bg, border) | `text-green-700` `bg-green-50` | `text-success` `bg-success/10` `border-success/30` |
| Warning | `text-amber-*` `text-yellow-*` | `text-warning` `bg-warning/10` |

> Note: for light mode, `on-surface` and `on-canvas` are the same ink, and
> `surface`/`canvas` differ only by one step; pick the role that matches the
> element's job (text vs ground) so dark-mode swaps stay correct.

## Do's and Don'ts

**Do**

- Quote tokens (`{colors.primary}`) — never hexes — in `components:`.
- Use `accent-warm` for at most one element per screen.
- Test every new color pair in `npm run design:lint`.
- Reserve terracotta for the working surface (actions, the user's voice) —
  never as a page backdrop.

**Don't**

- Don't introduce per-component shadows. Use outlines.
- Don't use raw Tailwind palette colors (`gray-*`/`slate-*`/`zinc-*`/`neutral-*`/
  bare `white`) for chrome — consume token utilities per the mapping table above.
- Don't add a second display font.
- Don't redefine colors for dark mode in components — consume role tokens.
- Don't introduce off-scale radii (e.g. `rounded-[12px]`, raw `4px`). Use the
  role scale: containers `{rounded.lg}`, controls `{rounded.md}`, inline
  `{rounded.xs}`, icon buttons `{rounded.sm}`, pills `{rounded.full}`. The window
  root (`{rounded.xl}`) is the sole exception.
