## ADDED Requirements

### Requirement: Action tool registration

The renderer SHALL provide a registry that lets UI code register a semantic action as an agent-callable tool, identified by a unique kebab/snake name, a human-readable description, an input JSON Schema for its arguments, and an output JSON Schema describing the `value` it returns (`{type:"null"}` for void actions). Registering an action SHALL bind it to a handler that invokes existing renderer logic (state dispatch, navigation, component callbacks).

#### Scenario: Register and serialize an action

- **WHEN** a component registers an action `open_tab` with input schema `{tabId: string}`, an output schema, and a handler
- **THEN** the registry exposes a tool definition `{name:"open_tab", description, inputSchema, outputSchema}` that is included in the session tool catalog

#### Scenario: Execute a registered action

- **WHEN** the bridge dispatches an `open_tab` invocation with `{tabId:"files"}`
- **THEN** the bound handler runs and the "files" tab becomes active
- **AND** the registry returns a success result envelope `{ok:true, value}`

#### Scenario: Invoke an unregistered or unmounted action

- **WHEN** an invocation targets an action name not present in the registry
- **THEN** the registry returns `{ok:false, error:{kind:"not_found", message}}` without throwing

#### Scenario: Handler throws an unexpected exception

- **WHEN** a registered action handler throws during execution (e.g. a stale closure or null ref)
- **THEN** the registry catches it and returns `{ok:false, error:{kind:"internal", message}}` (consistent with `toIpcError()`)
- **AND** the exception does not propagate to the bridge client, so a `tool_result` is always produced

### Requirement: State introspection tools

The renderer SHALL provide a registry of state-reader tools that return serializable snapshots of UI state (e.g. a button's enabled/visible/label state, the set of open tabs, the active pane). State readers SHALL be side-effect free.

#### Scenario: Read a button's state

- **WHEN** the agent invokes `get_button_state` with `{id:"run"}`
- **THEN** the registry returns `{ok:true, value:{disabled:boolean, visible:boolean, label:string}}` reflecting the live DOM/component state

#### Scenario: Read aggregate UI state

- **WHEN** the agent invokes `get_open_tabs`
- **THEN** the registry returns the current list of open tab identifiers without mutating any state

### Requirement: Generic data-testid fallback tools

The renderer SHALL expose generic fallback tools `click_by_testid` and `read_by_testid` for elements not covered by a registered action. `click_by_testid` SHALL operate ONLY on elements carrying both a stable `data-testid` attribute AND an explicit opt-in attribute `data-agent-clickable`; elements without the opt-in (e.g. destructive controls) SHALL be unreachable by the generic clicker. `read_by_testid` is side-effect-free and SHALL operate on any element with a `data-testid` (no opt-in required), returning a bounded, serializable field subset and NEVER raw `innerHTML`. Selection SHALL use these attributes and SHALL NOT rely on positional or visual cues.

An element is considered **visible** when it has a non-null `offsetParent` (i.e. not `display:none` and not inside a `display:none` ancestor) and a non-zero bounding box; `click_by_testid` SHALL target only visible elements.

#### Scenario: Click an opted-in element by test id

- **WHEN** the agent invokes `click_by_testid` with `{testId:"settings-open"}` and a visible element with `data-testid="settings-open"` AND `data-agent-clickable` exists
- **THEN** that element receives a synthetic click and the registry returns `{ok:true}`

#### Scenario: Refuse an element without the opt-in

- **WHEN** `click_by_testid` targets an element that has `data-testid` but lacks `data-agent-clickable`
- **THEN** the registry returns `{ok:false, error:{kind:"forbidden", message:"element exists but lacks data-agent-clickable"}}` and the element is not clicked

#### Scenario: Refuse a present-but-hidden element

- **WHEN** `click_by_testid` targets an opted-in element whose `offsetParent` is null (e.g. inside an inactive tab panel)
- **THEN** the registry returns `{ok:false, error:{kind:"not_found", message}}` and no click occurs

#### Scenario: Target a missing test id

- **WHEN** `click_by_testid` targets a `data-testid` that does not exist in the DOM
- **THEN** the registry returns `{ok:false, error:{kind:"not_found", message}}`

#### Scenario: Read an element's state by test id

- **WHEN** the agent invokes `read_by_testid` with `{testId:"run"}` and an element with `data-testid="run"` exists
- **THEN** the registry returns `{ok:true, value:{tagName, textContent, disabled:boolean, visible:boolean}}` and no `innerHTML`

#### Scenario: Read a missing test id

- **WHEN** `read_by_testid` targets a `data-testid` not present in the DOM
- **THEN** the registry returns `{ok:false, error:{kind:"not_found", message}}`

### Requirement: Concurrency semantics

When multiple frontend tools are invoked concurrently, the renderer SHALL execute state-mutating action handlers serially in arrival order, while side-effect-free state readers MAY execute concurrently. Action tools SHALL be advertised as parallel-unsafe and state readers as parallel-safe so the agent's orchestrator batches them accordingly. State readers SHALL observe the live state at invocation time and SHALL NOT be delayed by in-flight actions (no global read-write lock); consequently a reader issued alongside an action may observe pre-action state. To read state guaranteed to be after a specific action, the agent invokes the reader only after receiving that action's result.

#### Scenario: Concurrent actions serialize

- **WHEN** `open_tab` and another action arrive concurrently
- **THEN** their handlers run one at a time in arrival order, with no interleaving that could corrupt shared UI state

#### Scenario: Concurrent reads do not block

- **WHEN** several state readers (e.g. `get_button_state`, `get_open_tabs`) arrive concurrently
- **THEN** they may resolve concurrently without serialization

#### Scenario: Reader is not delayed by an in-flight action

- **WHEN** `get_open_tabs` is invoked concurrently with an in-flight `open_tab` whose handler has not completed
- **THEN** `get_open_tabs` resolves against the live state at its invocation time and may return the pre-`open_tab` tab set

### Requirement: Session tool catalog

The renderer SHALL assemble all registered action, state, and fallback tools into a single catalog of `{name, description, inputSchema, outputSchema}` entries suitable for publishing to the agent at session start.

#### Scenario: Assemble the catalog

- **WHEN** the catalog is requested at session start
- **THEN** it contains exactly the currently registered tools, each with a unique name and valid input/output JSON Schemas
