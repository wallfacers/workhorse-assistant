# Agent Workspace

- **Status:** draft
- **Created:** 2026-05-29
- **Last reviewed:** 2026-05-29
- **Owner:** wallfacers
- **Related:** `openspec/changes/add-three-pane-shell` (phase R0) and roadmap
  phases R1–R5 below; `docs/PRODUCT_SENSE.md` (taste filter — see "Open tension").

A product spec describes **what the user can do** and **why**. Per-phase
implementation lives in OpenSpec changes under `openspec/changes/`; this file is
the canonical, durable description of the workspace and its MVP roadmap.

## Who

The **patient power user** (`docs/PRODUCT_SENSE.md`): comfortable in a CLI, runs
coding-agent CLIs (Claude Code, Codex, GLM, …) for long sessions, and wants to
*see* what an agent did and inspect its output — not a hand-held chat client.

## What

A **three-pane workspace** that lets one person drive, watch, and inspect coding
agents in a single desktop window:

- **Left — Agent rail:** compose and launch a task, pick the model/tools it runs
  with, and browse the list of tasks.
- **Center — terminal workspace:** watch agents run as embedded full-screen TUIs
  (PTY-backed), with tabbed groups and resizable splits. *(Shipped: S0–S2.)*
- **Right — work panel:** inspect the active task's **files** (a tree of its
  working directory), **preview** their contents and artifacts (text/code,
  images, PDF, PPT), and read task **metadata** (branch, prompt, tags).

Delivered smallest-value-first, in phases:

| Phase | OpenSpec change | User-visible value |
|-------|-----------------|--------------------|
| **R0** | `add-three-pane-shell` | The workspace *looks* right: Agent rail, terminal center, work panel — layout only, placeholder content, current styling. |
| **R1** | `add-file-tree-backing` | The Files tree shows the agent's **real** working directory and expands on demand. |
| **R2** | `add-file-preview` | Click a file → read its text/code content; view images, in the Preview region. |
| **R3** | `add-artifact-viewer` | View richer outputs — PDF, PPT — and do basic browser-style operations on them. |
| **R4** | `add-agent-task-flow` | Create a task in the rail → it spawns an agent terminal group; task metadata reflects the live session. |
| **R5** | `add-agent-controls` | The model/tools selector picks a launch profile; search filters tasks; tasks persist across restarts. |

## Why

The product's core value is **watching and coordinating coding agents**. The
center pane already delivers that (S0–S2). But the left and right panes are still
the original AI-Studio sketch (a knowledge-base navigator and a static document
card) — they don't serve the agent workflow at all. The user cannot, today,
launch a task from the shell or inspect an agent's files/outputs without leaving
the app. This spec turns the surrounding shell into the workbench the center pane
implies.

## Success

- A user can look at the window and immediately read it as "drive (left) · watch
  (center) · inspect (right)" — confirmed in R0.
- By R2, after an agent edits files, the user can open the right pane, find the
  changed file in the tree, and read its new contents **without** alt-tabbing to a
  separate editor or file manager.
- By R4, starting a new task is one action in the rail, and the resulting agent
  appears as a terminal group the user can watch.
- Every phase ships independently and leaves the app usable (no half-wired pane).

## Anti-success

We are **not** building, under this spec:

- A general-purpose IDE or code editor — the Preview region *reads* files; it does
  not become an editing surface.
- A general file manager — the Files tree is scoped to the active task's working
  directory, not a whole-disk browser.
- Multi-user or shared workspaces (`PRODUCT_SENSE.md` forbids this).
- A model marketplace — the model/tools selector picks among **configured launch
  profiles**, not an open catalog.
- Renderer-side privileged work — file reads and process spawning stay in the Rust
  core (`AGENTS.md` boundary); the panes never touch the filesystem or network
  directly.

## Open tension — partially reconciled

`docs/PRODUCT_SENSE.md` framed the product as "one person working with **one**
agent for hours," which diverged from the shipped multi-agent direction (S0–S2)
and this spec. Per `docs/product-specs/index.md`, a spec conflicting with
`PRODUCT_SENSE.md` cannot become **active** without first amending it.

- **Done (2026-05-29):** `PRODUCT_SENSE.md` updated to "*one or more* concurrent
  agent sessions" — the primary conflict is cleared, unblocking promotion past
  `draft`.
- **Remaining (minor):** the "Three panes, **one model**, one local store"
  shorthand still reads as single-model. It is defensible (one model per session)
  but should be revisited at **R5** when the model/tools selector lands; flag it
  then rather than pre-emptively rewording the taste doc.
