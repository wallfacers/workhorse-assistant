## Context

`ImagePreview` (`src/components/editor/FileEditor.tsx:344`) renders an image with
a single, fixed strategy:

```tsx
const src = convertFileSrc(filePath);
<img src={src} className="max-w-full max-h-[calc(100vh-200px)] object-contain ..." />
```

The bytes arrive losslessly over Tauri's asset protocol, but the `<img>` is
always constrained to the viewport, so a large image is permanently downscaled
by the webview. On this project's target environment (Linux/WSL2 →
software-rendered webkit2gtk, per the comments in `index.css`), that downscale's
resampling quality is below Chromium's, amplifying the softness. The user cannot
reach a 1:1 view at all.

This is a small, self-contained UI change touching one component. A design doc
is warranted only because there are a few real decisions (where mode state
lives, how 100% scrolling/centering works, DPR semantics) worth settling before
coding.

## Goals / Non-Goals

**Goals:**
- Give the user a true native-resolution (100%) view, scrollable when the image
  exceeds the viewport.
- Keep fit-to-window as the default, unchanged in appearance from today.
- One-gesture toggle (click the image) between the two modes.
- Zero changes to the data path, Rust, IPC, or dependencies.

**Non-Goals:**
- Free/continuous zoom, wheel zoom, zoom presets (200%/400%), fit-width.
- Drag-to-pan beyond native scrollbars (scrollbar + normal scroll is enough).
- Rotation, EXIF orientation handling, image editing.
- Improving fit-mode downscale quality via canvas resampling — 100% mode makes
  it unnecessary for the "see it sharp" use case.

## Decisions

### D1: Two discrete modes, not continuous zoom
A `mode: 'fit' | 'actual'` state captures the entire feature. Rationale: the
user asked for "daily-enough but clear"; fit covers overview, 100% covers
pixel-exact inspection. A continuous zoom would add pan math, zoom-origin
tracking, and bounds clamping for marginal daily benefit. Alternative (free
zoom) is explicitly deferred to a possible follow-up and noted in the proposal.

### D2: State is local to `ImagePreview`
Hold `mode` with `useState` inside `ImagePreview`; reset to `'fit'` when
`filePath` changes (via `useEffect` keyed on `filePath`, or by keying the
component with `key={filePath}` from the parent). Rationale: mode is ephemeral
view state with no need to survive tab switches or persist. Keeping it local
avoids touching the editor reducer/group state. Alternative (lift into Group
state) rejected as over-engineering for ephemeral UI state.

### D3: 100% rendering via native image size + scroll container
- **Fit mode**: keep today's `object-contain` + max-bounds approach inside a
  centered flex container.
- **100% mode**: wrap the image in an `overflow-auto` scroll container; render
  the `<img>` at intrinsic size (no width/height/max constraints — let it take
  its natural pixel dimensions). When smaller than the container, center it
  (flex centering still applies because the content is smaller than the box);
  when larger, the container scrolls. Rationale: the browser's native scroll is
  free, accessible, and matches VSCode's image preview behavior. No manual pan
  state needed.

### D4: "100%" means 1 image pixel = 1 CSS pixel
Render at intrinsic CSS pixels (the natural `<img>` size). On a HiDPI display
(`devicePixelRatio > 1`) the webview may still map 1 CSS px to multiple device
px, but on the target WSLg environment DPR is typically 1, so 1:1 holds. Going
further (CSS size = naturalWidth / devicePixelRatio for device-pixel exactness)
is deferred — it complicates the common case for a benefit that doesn't apply on
the primary platform. Documented here so a future follow-up can revisit if HiDPI
hosts become a target.

### D5: Cursor + affordance
`cursor: zoom-in` in fit mode, `cursor: zoom-out` in 100% mode, applied to the
`<img>`. The whole image is the click target (no separate button needed for the
minimal version). A small mode hint/caption may accompany it but is optional.

### D6: image-rendering left at default (auto/smooth)
At 100% the image is at native size, so no resampling occurs and the bytes are
shown verbatim regardless of `image-rendering`. We do not set `pixelated`
(that only matters above 100%, which is out of scope). Fit mode keeps the
browser's default smoothing.

## Risks / Trade-offs

- [Fit mode still soft on WSLg] → Accepted. Fit is the "overview" mode; the user
  gets sharpness by toggling to 100%. Documented as a non-goal to improve fit
  resampling now.
- [HiDPI hosts: "100%" not device-pixel-exact] → Low impact on the WSLg target
  (DPR≈1). Recorded in D4 as a deferred refinement, not a blocker.
- [Very large images at 100% (e.g. 8000×8000)] → The webview renders the full
  bitmap and scrolls it; memory/scroll cost is the browser's normal image
  handling. Daily screenshots are far below any concern; no tiling needed.
- [Click vs. (future) drag-pan ambiguity] → With scrollbar-based panning there
  is no drag gesture on the image, so a plain click unambiguously toggles. If
  drag-to-pan is ever added, the toggle must distinguish click from drag (guard
  on pointer movement threshold). Noted for the follow-up.

## Open Questions

- Should a tiny mode indicator ("100%" / "Fit") be shown, or is the cursor
  enough? Leaning cursor-only for the minimal version; trivial to add a label.
- Toggle affordance: click-anywhere-on-image only, or also a small button in the
  caption row? Default: click-only to stay minimal.
