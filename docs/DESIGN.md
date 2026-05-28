---
version: alpha
name: Workhorse
description: >-
  Quiet, focused, working surface. Deep maritime teals and blues against a
  warm-neutral canvas. Built for long sessions of thinking with an agent.
colors:
  primary: "#024a44"
  on-primary: "#FFFFFF"
  primary-container: "#0b6477"
  on-primary-container: "#E6F1F2"
  secondary: "#0b6477"
  on-secondary: "#FFFFFF"
  tertiary: "#144272"
  on-tertiary: "#FFFFFF"
  neutral: "#ECEFF2"
  on-neutral: "#101012"
  surface: "#FFFFFF"
  on-surface: "#101012"
  surface-muted: "#F4F6F8"
  surface-dark: "#101012"
  on-surface-dark: "#ECEFF2"
  surface-dark-muted: "#1A202C"
  outline: "#C4CCD3"
  outline-dark: "#2A2F36"
  accent-warm: "#B8422E"
  on-accent-warm: "#FFFFFF"
  success: "#1F7A5A"
  warning: "#B4731B"
  danger: "#A6342B"
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
  sm: 8px
  md: 16px
  lg: 24px
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
    rounded: "{rounded.md}"
    padding: 12px
  message-bubble-assistant:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.md}"
    padding: 12px
  button-primary:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.on-tertiary}"
    rounded: "{rounded.sm}"
    padding: 10px
  button-primary-hover:
    backgroundColor: "{colors.primary-container}"
    textColor: "{colors.on-primary-container}"
  button-ghost:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.sm}"
    padding: 10px
  input-text:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.sm}"
    padding: 10px
  badge-accent:
    backgroundColor: "{colors.accent-warm}"
    textColor: "{colors.on-accent-warm}"
    rounded: "{rounded.full}"
    padding: 4px
---

## Overview

**Workhorse** is the visual identity for a focused, long-session AI assistant.
The aesthetic borrows from maritime cartography — deep teals and inks on a
warm, paper-like ground — rather than the cold neon of most chat UIs. The goal
is a surface you can stare at for an hour without flinching.

Two emotional anchors:

- **Quiet capability.** The chrome stays out of the way. Strong contrast and
  generous whitespace do the work; no decorative gradients in the working area.
- **Maritime depth.** Deep teal (`primary` / `secondary` / `tertiary`) is the
  brand voice — it lives *in* the working surface (buttons, the user's own
  message bubbles, active accents), never as a page backdrop. The window is
  frameless and paints a single quiet `surface-muted` ground; there is no
  gradient frame.

Dark mode flips the canvas to near-black ink (`surface-dark`) but keeps the
exact same token roles. Components do **not** redefine colors for dark mode;
they consume role tokens.

## Colors

The palette is a small set of role-named tokens. Components never hard-code
hexes — they consume `{colors.*}` references.

- **`primary` (#024a44):** Deep teal. Anchor color for the user's own voice
  (message bubbles, primary affirmations).
- **`secondary` (#0b6477):** Mid teal-blue. Hover/active state for primary,
  and the middle stop of the windowed-mode gradient.
- **`tertiary` (#144272):** Deep navy. The call-to-action color — every button
  that *does* a thing wears this.
- **`neutral` (#ECEFF2):** Warm off-white canvas. The interior working surface.
- **`surface` (#FFFFFF):** Cards and panels that sit on the canvas.
- **`surface-muted` (#F4F6F8):** The main chat area background; quieter than
  `surface` so messages float on top with clear figure/ground.
- **`surface-dark` / `surface-dark-muted`:** Dark-mode equivalents of
  `neutral` / `surface-muted`.
- **`accent-warm` (#B8422E):** Reserved for moments that **must** be noticed
  (the only warm note in the entire palette). Use sparingly — a single accent
  on screen at a time.

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
  padding, no gradient frame. The window is opaque; rounded corners come from
  the OS window manager (Windows 11 DWM rounds top-level windows), so the
  renderer paints a square `surface-muted` ground and does not round the root.
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

- **Window corners:** provided by the OS on the frameless window (e.g. Windows
  11 DWM); the renderer keeps the root square — an opaque window would otherwise
  show square corners poking out beyond a CSS radius.
- **Panes:** `{rounded.lg}` (24px).
- **Cards / message bubbles:** `{rounded.md}` (16px).
- **Inputs / buttons / chips:** `{rounded.sm}` (8px).
- **Avatars / status dots / badges:** `{rounded.full}`.

The radius scale is *monotonic and componential*: outer shapes are always
larger than the shapes they contain. Never break this — concentric radii
look like a different design system.

## Components

The `components:` block at the top is the contract. Each entry maps a
component slug to its visual tokens. The renderer consumes these via the
exported CSS variables (`npm run design:export:css`).

Variants are sibling entries (e.g. `button-primary` / `button-primary-hover`).
Adding a new component requires:

1. A new `components.<slug>` entry here.
2. A matching Tailwind class composition in `src/components/`.
3. Both `npm run design:lint` and `npm run lint` passing.

## Do's and Don'ts

**Do**

- Quote tokens (`{colors.primary}`) — never hexes — in `components:`.
- Use `accent-warm` for at most one element per screen.
- Test every new color pair in `npm run design:lint`.
- Reserve deep teal for the working surface (actions, the user's voice) —
  never as a page backdrop.

**Don't**

- Don't introduce per-component shadows. Use outlines.
- Don't add a second display font.
- Don't redefine colors for dark mode in components — consume role tokens.
- Don't break the concentric-radius rule.
