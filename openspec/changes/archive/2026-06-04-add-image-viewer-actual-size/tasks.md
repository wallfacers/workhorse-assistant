## 1. Mode state & reset

- [x] 1.1 Add `mode: 'fit' | 'actual'` state to `ImagePreview` (`FileEditor.tsx`), defaulting to `'fit'`
- [x] 1.2 Reset `mode` to `'fit'` and reset scroll position when `filePath` changes (effect keyed on `filePath`, or `key={filePath}` from the parent)

## 2. Rendering for both modes

- [x] 2.1 Fit mode: keep the existing centered `object-contain` + max-bounds rendering (no visual change from today)
- [x] 2.2 100% mode: wrap the `<img>` in an `overflow-auto` scroll container and render at intrinsic size (drop width/height/max constraints so the image uses its native pixel dimensions)
- [x] 2.3 Center the image in 100% mode when it is smaller than the container; allow native scroll when larger
- [x] 2.4 Keep `convertFileSrc(filePath)` as the source unchanged; do not introduce any resized/base64 copy

## 3. Toggle interaction

- [x] 3.1 Toggle `mode` on image click (fit → actual → fit)
- [x] 3.2 Set the cursor per mode: `zoom-in` in fit mode, `zoom-out` (or grab) in 100% mode

## 4. Preserve existing states

- [x] 4.1 Verify loading and error states still render correctly in both modes
- [x] 4.2 Keep the filename caption visible in fit mode

## 5. Verification

- [x] 5.1 `npm run lint` passes (type-check gate)
- [x] 5.2 Manually verify in the running app: a large screenshot opens fit (full image visible), clicking shows it at 100% with scrollbars and pixel-sharp detail, clicking again returns to fit; a small image stays at native size in both modes; opening a different image resets to fit
