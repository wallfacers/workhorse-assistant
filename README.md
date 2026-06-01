# Workhorse Assistant

A minimalist desktop AI assistant, built with **[Tauri v2](https://v2.tauri.app/)**,
**React 19**, **Vite 6**, and **Tailwind v4**.

> **For agents and contributors:** start at [`AGENTS.md`](./AGENTS.md). It is the
> map to the rest of the knowledge base in [`docs/`](./docs).

## Prerequisites

- **Node.js** ≥ 20 (`node --version`)
- **Rust** ≥ 1.77.2 (`rustc --version` — install via [rustup](https://rustup.rs))
- **Platform deps** for Tauri — see the
  [official prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS.
  On Debian/Ubuntu (or WSL with a display):
  ```bash
  sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
      libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
  ```

## First-time Setup

```bash
npm install
# Generate the application icons (one-time)
# npx @tauri-apps/cli icon path/to/your-source-1024.png
```

## Running

```bash
# Renderer-only (browser) — fast iteration on UI
npm run dev

# Full desktop app (Rust + renderer)
npm run tauri:dev
```

## Building

```bash
# Type-check + production renderer build
npm run build

# Native desktop installer / bundle
npm run tauri:build
```

Bundled artifacts land in `src-tauri/target/release/bundle/`.

## Remote sidecar in WSL2 (Windows host)

The natural "develop in WSL" setup mirrors **VS Code Remote-WSL**: a
Windows-native build of the assistant on the host, the `workhorse-agent` sidecar
running **inside WSL2**, and the opened project living at a WSL path
(`/home/<you>/proj`). The renderer never touches the network directly —
everything privileged crosses the Rust bridge's loopback HTTP boundary to the
sidecar — so the sidecar is effectively a localhost "remote".

**Networking.** The bridge reaches the sidecar over `http://localhost:<port>`.

- Recent Windows builds forward `localhost` from the host into the running WSL2
  distro automatically — no setup needed in the common case.
- If `localhost` does not reach the sidecar (older builds, multiple distros, VPN
  interference), enable **mirrored networking mode** in `%UserProfile%\.wslconfig`
  and restart WSL (`wsl --shutdown`):

  ```ini
  [wsl2]
  networkingMode=mirrored
  ```

- Transient forward drops do **not** require a restart: the bridge's SSE stream
  reconnects on its own, and live sessions re-subscribe rather than being
  recreated.

**Pointing at the sidecar.** Set the agent endpoint in **Settings** (it is
editable and reconnects in place). The project picker browses the *sidecar's*
filesystem namespace (WSL paths), and on a Windows host a new terminal opens as a
WSL shell rooted at the project (`wsl.exe -d <distro> --cd <path>`) when the
sidecar reports it runs under WSL.

> **Same-host note.** If you instead run a *Linux* build of the assistant inside
> the same WSL distro as the sidecar, there is no host↔WSL boundary to bridge:
> terminals launch as a local shell at the project path, and `wsl.exe` is never
> invoked (the bridge is Windows-host-only). See `add-wsl-remote` D-WSL-7.

## Project Layout

```
.
├── AGENTS.md            # Map for AI agents and contributors
├── CLAUDE.md            # Pointer for Claude Code (mirrors AGENTS.md)
├── ARCHITECTURE.md      # Top-level package/domain map
├── docs/                # Structured knowledge base (the system of record)
├── src/                 # React + TypeScript renderer
└── src-tauri/           # Rust backend (Tauri v2)
```

## Working with this repository

This repo treats itself as a **system of record** in the style of OpenAI's
[Harness Engineering](https://openai.com/index/harness-engineering/) post.
Documentation lives next to code, is checked into git, and is structured so
agents can navigate it via progressive disclosure rather than read a single
monolithic instruction file.

The design system is captured in [`docs/DESIGN.md`](./docs/DESIGN.md) in the
[Google DESIGN.md format](https://github.com/google-labs-code/design.md), which
makes it lintable, diff-able, and exportable to Tailwind.

## License

TBD.
