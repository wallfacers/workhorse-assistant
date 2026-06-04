## Why

The file editor's image preview (`FileEditor.tsx` `ImagePreview`) only ever
renders images scaled to fit the window (`object-contain` + `max-h`). On WSLg's
software-rendered webkit2gtk webview the fit-to-window downscale looks soft, and
— more fundamentally — the user has **no way to view an image at its native
resolution**, so large screenshots always lose detail. The image bytes are
served losslessly via `convertFileSrc`; the perceived "compression" is purely a
display-mode limitation. Users need a way to see true 1:1 pixels.

## What Changes

- Add a **fit ⇄ 100% (actual-size)** toggle to the image preview:
  - **Fit** (default): image scaled to fit the viewport, centered — overview.
  - **100%**: image rendered at native pixel dimensions; when larger than the
    viewport it becomes scrollable so the user can pan to any region. At 100%
    no browser downscaling occurs, so the image is pixel-exact (the "lossless
    HD" view the user wants), which also sidesteps webkit's software-renderer
    resampling quality.
- **Click the image** toggles between fit and 100%; the cursor reflects the
  available action (zoom-in in fit mode, zoom-out / grab in 100% mode).
- Preserve all existing behaviour: lossless `convertFileSrc` source, loading and
  error states, dark/light surfaces, filename caption.
- Out of scope (explicitly): free zoom beyond 100%, wheel zoom, zoom presets
  (200%/400%), and rotation. Two modes are sufficient for daily use; richer
  zoom can be a follow-up.

## Capabilities

### New Capabilities
- `image-preview`: viewing image files in the file editor, including the fit and
  actual-size (100%) display modes and the toggle interaction.

### Modified Capabilities
<!-- None — the existing file-editor spec contains no image-preview requirements. -->

## Impact

- Code: `src/components/editor/FileEditor.tsx` (`ImagePreview` component only).
  Possibly small CSS additions in `src/index.css` for the scroll container /
  cursor states.
- No Rust, IPC, or dependency changes. The asset protocol path is unchanged.
- No breaking changes; default behaviour (fit) matches today's appearance.
