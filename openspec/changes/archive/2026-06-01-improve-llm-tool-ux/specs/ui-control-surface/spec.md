## MODIFIED Requirements

### Requirement: Action tool registration

The renderer SHALL provide a registry that lets UI code register a semantic action as an agent-callable tool, identified by a unique kebab/snake name, a human-readable description, an input JSON Schema for its arguments, and an output JSON Schema describing the `value` it returns. Registering an action SHALL bind it to a handler that invokes existing renderer logic. Every property in both `inputSchema` and `outputSchema` SHALL carry a `description` field. Tool descriptions for non-trivial tools SHOULD use Markdown formatting (bold, inline code, bullet lists, short examples).

#### Scenario: Register and serialize an action

- **WHEN** a component registers an action `open_tab` with input schema `{tabId: string}`, an output schema, and a handler
- **THEN** the registry exposes a tool definition `{name:"open_tab", description, inputSchema, outputSchema}` that is included in the session tool catalog
- **AND** every property in `inputSchema` and `outputSchema` has a `description` field

#### Scenario: Execute a registered action

- **WHEN** the bridge dispatches an `open_tab` invocation with `{tabId:"files"}`
- **THEN** the bound handler runs and the "files" tab becomes active
- **AND** the registry returns a success result envelope `{ok:true, value}` where `value` is a structured confirmation object containing at minimum a boolean success flag and the tool's key identifiers (e.g. `{ opened: true, index, label, profileId }`)

#### Scenario: Invoke an unregistered or unmounted action

- **WHEN** an invocation targets an action name not present in the registry
- **THEN** the registry returns `{ok:false, error:{kind:"not_found", message}}` without throwing

#### Scenario: Handler throws an unexpected exception

- **WHEN** a registered action handler throws during execution (e.g. a stale closure or null ref)
- **THEN** the registry catches it and returns `{ok:false, error:{kind:"internal", message}}`
- **AND** the exception does not propagate to the bridge client, so a `tool_result` is always produced

### Requirement: Generic data-testid fallback tools

The renderer SHALL expose generic fallback tools `click_by_testid` and `read_by_testid` for elements not covered by a registered action. `click_by_testid` SHALL operate ONLY on elements carrying both a stable `data-testid` attribute AND an explicit opt-in attribute `data-agent-clickable`. `read_by_testid` is side-effect-free and SHALL operate on any element with a `data-testid`, returning a bounded, serializable field subset and NEVER raw `innerHTML`. Every property in both tools' `inputSchema` and `outputSchema` SHALL carry a `description` field.

`click_by_testid` SHALL return a structured confirmation object on success (e.g. `{ clicked: true, testId, tagName }`) instead of bare `null`.

Error messages for both tools SHALL include self-repair context: for `not_found` errors, list visible `data-testid` values in the current DOM (up to 20); for `forbidden` errors, explain the opt-in requirement; for `validation` errors, describe the expected format.

#### Scenario: Click an opted-in element by test id

- **WHEN** the agent invokes `click_by_testid` with `{testId:"settings-open"}` and a visible element with `data-testid="settings-open"` AND `data-agent-clickable` exists
- **THEN** that element receives a synthetic click and the registry returns `{ok:true, value:{ clicked: true, testId: "settings-open", tagName: "button" }}`

#### Scenario: Refuse an element without the opt-in

- **WHEN** `click_by_testid` targets an element that has `data-testid` but lacks `data-agent-clickable`
- **THEN** the registry returns `{ok:false, error:{kind:"forbidden", message}}` where message explains the `data-agent-clickable` opt-in requirement
- **AND** the element is not clicked

#### Scenario: Target a missing test id

- **WHEN** `click_by_testid` targets a `data-testid` that does not exist in the DOM
- **THEN** the registry returns `{ok:false, error:{kind:"not_found", message}}` where message lists visible `data-testid` values to aid self-correction

## ADDED Requirements

### Requirement: Enriched error messages for tab actions

Tab action tools (`open_tab`, `focus_tab`) SHALL include self-repair context in their error messages. For index-out-of-range errors, the message SHALL state the current tab count and valid index range, and suggest calling `get_open_tabs`. For invalid enum values, the message SHALL list all valid values.

#### Scenario: focus_tab with out-of-range index

- **WHEN** `focus_tab` is invoked with `{index: 5}` and only 3 tabs exist
- **THEN** the error message includes the text "currently 3 tabs open (indices 0–2)" and suggests calling `get_open_tabs`

#### Scenario: open_tab with invalid profileId

- **WHEN** `open_tab` is invoked with `{profileId: "unknown"}`
- **THEN** the error message lists all valid profileId values

### Requirement: Markdown tool descriptions

Tool `description` strings for non-trivial tools SHOULD use Markdown formatting. This includes inline code for parameter names, bold for key terms, and a one-line usage example in the description when the workflow spans multiple tools.

#### Scenario: focus_tab description uses Markdown

- **WHEN** the tool catalog is assembled
- **THEN** `focus_tab`'s description contains Markdown formatting (at minimum inline code for parameter names)
