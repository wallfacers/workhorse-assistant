## ADDED Requirements

### Requirement: Syntax-highlighted fenced code

Fenced code blocks in chat messages SHALL be syntax-highlighted using a lazily
loaded Shiki singleton highlighter. Highlighting SHALL be theme-agnostic at the
markup level: the highlighter emits CSS-variable colours (`defaultColor:false`,
`github-light` + `github-dark`) so a single rendered block adapts to light or
dark without re-tokenizing.

#### Scenario: A fenced block is highlighted

- **WHEN** an assistant message contains a fenced code block with a language tag
- **THEN** the block renders with per-token syntax colours produced by the Shiki singleton (loaded once, reused across blocks)

#### Scenario: Highlight follows app theme without re-render

- **WHEN** the app toggles between light and dark mode
- **THEN** the already-rendered code block switches colour scheme via CSS variables, with no JavaScript re-highlight

### Requirement: Language label and copy affordance

Each fenced code block SHALL display a language label pill and a copy button. The
copy button SHALL write the block's raw source to the clipboard and show a
confirmation state for ~2 seconds before reverting.

#### Scenario: Copy a code block

- **WHEN** the user clicks the copy button on a code block
- **THEN** the block's raw text is written to the clipboard and the button shows a confirmed state for ~2s, then reverts

#### Scenario: Language label reflects the fence

- **WHEN** a code block is fenced as ```` ```python ````
- **THEN** the block's label pill reads a human-friendly language name (e.g. "Python")

### Requirement: Light/dark dual-theme styling

Code-block chrome (container, top bar, language pill, action buttons) SHALL use
the app's existing design tokens (`var(--color-*)`) and follow the `.dark` class,
with no hand-tuned hex values in components or CSS. The highlighted `pre` SHALL
render correctly in both themes.

#### Scenario: Code block legible in both themes

- **WHEN** the app is in light mode and then dark mode
- **THEN** the code-block container, bar, label, and buttons remain legible using design tokens, and the highlighted source uses the matching Shiki theme

### Requirement: Streaming code stays stable

While a code block is still streaming, the renderer SHALL NOT run syntax
highlighting on it; it SHALL render the partial source as plain text and mark it
as streaming. `StreamingText` SHALL bypass character pacing when the content
contains a code fence, revealing fenced code instantly rather than character by
character, so highlighted blocks are not re-tokenized on every tick.

#### Scenario: Code fence bypasses pacing

- **WHEN** a streaming assistant message contains a code fence
- **THEN** the fenced content is revealed immediately (not paced character-by-character) and is not syntax-highlighted until streaming completes

#### Scenario: No flicker as a code block grows

- **WHEN** a code block grows during streaming
- **THEN** it renders as stable plain text (no per-tick re-highlight flicker); highlighting is applied once after the block finishes

### Requirement: Inline code remains lightweight

Inline code (single backticks) SHALL keep a lightweight pill style distinct from
fenced blocks and SHALL NOT trigger syntax highlighting or the copy/label chrome.

#### Scenario: Inline code is not a code block

- **WHEN** a message contains inline `code`
- **THEN** it renders with a subtle inline pill style and no copy button, language label, or Shiki highlighting
