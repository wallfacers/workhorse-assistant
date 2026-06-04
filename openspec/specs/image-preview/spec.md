# image-preview Specification

## Purpose
TBD - created by archiving change add-image-viewer-actual-size. Update Purpose after archive.
## Requirements
### Requirement: Lossless image source

The image preview SHALL load image files through the Tauri asset protocol
(`convertFileSrc`) so the original file bytes are delivered without re-encoding
or recompression. The system SHALL NOT generate thumbnails, downscaled copies,
or base64 re-encodings of the image data.

#### Scenario: Image loaded from disk
- **WHEN** the user opens an image file (`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.bmp`, `.ico`)
- **THEN** the preview renders the image from `convertFileSrc(filePath)`
- **AND** no compressed or resized copy of the file is created

### Requirement: Fit display mode

The image preview SHALL provide a **fit** mode that scales the image to fit
within the available viewport while preserving aspect ratio, centered both
horizontally and vertically. Fit mode SHALL be the default when an image is
first opened. In fit mode the image SHALL NOT exceed the viewport bounds and
SHALL NOT be upscaled beyond its native dimensions.

#### Scenario: Open an image larger than the viewport
- **WHEN** the user opens an image whose native dimensions exceed the viewport
- **THEN** the image is scaled down to fit entirely within the viewport, centered
- **AND** the full image is visible without scrollbars

#### Scenario: Open an image smaller than the viewport
- **WHEN** the user opens an image whose native dimensions are smaller than the viewport
- **THEN** the image is displayed at its native size, centered
- **AND** the image is not stretched or upscaled to fill the viewport

### Requirement: Actual-size (100%) display mode

The image preview SHALL provide a **100%** (actual-size) mode that renders the
image at its native pixel dimensions with no scaling applied. When the image at
native size exceeds the viewport in either dimension, the preview SHALL become
scrollable so the user can pan to view any region. When the image is smaller
than the viewport, it SHALL remain centered.

#### Scenario: View a large image at 100%
- **WHEN** the user switches an oversized image to 100% mode
- **THEN** the image is rendered at its native pixel dimensions with no downscaling
- **AND** scrollbars appear allowing the user to pan across the full image

#### Scenario: View a small image at 100%
- **WHEN** the user switches a small image to 100% mode
- **THEN** the image is rendered at its native pixel dimensions, centered
- **AND** no scrollbars appear

### Requirement: Toggle between fit and 100%

The image preview SHALL let the user toggle between fit and 100% modes by
clicking the image. Each click SHALL switch to the other mode. The cursor over
the image SHALL communicate the available action: a zoom-in affordance while in
fit mode, and a zoom-out (or grab) affordance while in 100% mode.

#### Scenario: Click toggles to 100%
- **WHEN** the image is in fit mode and the user clicks it
- **THEN** the preview switches to 100% mode

#### Scenario: Click toggles back to fit
- **WHEN** the image is in 100% mode and the user clicks it (without dragging to pan)
- **THEN** the preview switches back to fit mode

#### Scenario: Cursor reflects current mode
- **WHEN** the pointer is over the image in fit mode
- **THEN** the cursor shows a zoom-in affordance
- **WHEN** the pointer is over the image in 100% mode
- **THEN** the cursor shows a zoom-out or grab affordance

### Requirement: Mode reset on file change

The image preview SHALL reset to the default fit mode and SHALL reset any scroll
position whenever the previewed file changes, so that opening a different image
always starts from its full overview.

#### Scenario: Open a second image after zooming the first
- **WHEN** the user has switched image A to 100% and then opens image B
- **THEN** image B opens in fit mode
- **AND** the scroll position is reset to the top-left / centered origin

### Requirement: Preserved loading and error states

The image preview SHALL retain its existing loading and error handling. While
the view is initializing it SHALL show a loading indicator, and on failure it
SHALL show an error message. The filename caption SHALL remain visible in fit
mode.

#### Scenario: Loading indicator before render
- **WHEN** an image view is initializing
- **THEN** a loading indicator is shown until the preview is ready

#### Scenario: Error on unreadable image
- **WHEN** the image cannot be displayed
- **THEN** an error message is shown in place of the image

