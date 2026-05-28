# Application Icons

This directory must contain the bundled application icons before `tauri build`
will succeed. The **vector source** is committed (`source.svg`); the binary
rasters / `.icns` / `.ico` are **not** — generate them locally on each
machine that needs them.

## Generating Icons

```bash
npx @tauri-apps/cli icon src-tauri/icons/source.svg
```

This produces every required asset alongside `source.svg`:

- `32x32.png`
- `128x128.png`
- `128x128@2x.png`
- `icon.icns` (macOS)
- `icon.ico` (Windows)
- platform-specific Android/iOS folders (if mobile targets are enabled)

## Replacing the Source

If you want a different marque, edit `source.svg` (1024×1024, rounded corners
baked in) and re-run the command above. The colors in `source.svg` are pulled
from [`../../docs/DESIGN.md`](../../docs/DESIGN.md) — if you change them
there, update `source.svg` to match.

## Why Not Commit the Binaries?

- They are derived artefacts; committing them invites drift from the source.
- `.icns` / `.ico` are platform-specific and large.
- The generator is one command and fast.

`tauri.conf.json` already references the standard filenames produced by
`@tauri-apps/cli icon` — no further configuration is required.
