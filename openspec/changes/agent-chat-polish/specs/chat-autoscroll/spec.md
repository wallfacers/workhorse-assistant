## ADDED Requirements

### Requirement: Jitter-free auto-follow on new content

The AgentRail message list SHALL follow the bottom as new assistant content
streams in, without visible jitter. When content grows (DOM mutation or element
resize) while the list is in the following state, the list SHALL scroll to the
bottom exactly once per animation frame, coalescing the `useLayoutEffect`
(structural) scroll and the observer-driven scroll so they never produce two
distinct scroll positions within the same frame.

#### Scenario: Streaming deltas do not jump

- **WHEN** assistant text streams in as many small deltas while the user is at the bottom
- **THEN** the list stays pinned to the bottom and the content does not visibly jump or double-scroll between frames

#### Scenario: Late-loading content keeps the list pinned

- **WHEN** an element inside the last message changes size after first paint (e.g. a code block finishes highlighting, an image loads)
- **THEN** a `ResizeObserver` re-pins the list to the bottom while following, sharing the same growth handler as the mutation path

### Requirement: Pause following on manual scroll-up

The list SHALL stop following the bottom when the user scrolls up, detected via
wheel (upward delta) or touch (downward finger movement) intent, or a native
scroll event that moves the scroll position up while not at the bottom. While
paused, new content SHALL NOT force the viewport downward.

#### Scenario: Wheel up pauses follow

- **WHEN** the user scrolls up with the mouse wheel during streaming
- **THEN** the list stops auto-following and remains where the user left it, even as new deltas arrive

#### Scenario: Touch drag pauses follow

- **WHEN** the user drags a finger downward (scrolling content up) on a touch device
- **THEN** the list stops auto-following

### Requirement: Re-engage following at strict bottom

The list SHALL re-enable following when the user scrolls back to within a strict
bottom threshold (<= 2px), so subsequent content resumes pinning to the bottom.

#### Scenario: Scrolling back to bottom resumes follow

- **WHEN** a paused user scrolls all the way back down to the strict bottom
- **THEN** following re-engages and the next delta pins the list to the bottom again

### Requirement: Forced re-follow on user send

When the user sends a message, the list SHALL force following back on and scroll
to the bottom, overriding any prior paused state, so the user always sees their
own message and the assistant's reply.

#### Scenario: Sending after scrolling up snaps to bottom

- **WHEN** the user has scrolled up (following paused) and then sends a new message
- **THEN** the list forces follow on and scrolls to the bottom regardless of the previous paused state

### Requirement: Scroll-to-bottom affordance

The chat area SHALL present a scroll-to-bottom button that is visible only when
the list is not at the bottom, toggled by opacity (not mount/unmount) to avoid
layout jitter. Clicking it SHALL scroll to the bottom and re-enable following.

#### Scenario: Button reflects bottom state without remounting

- **WHEN** the user scrolls up
- **THEN** the scroll-to-bottom button fades in via opacity; clicking it scrolls to the bottom, re-enables following, and the button fades out
