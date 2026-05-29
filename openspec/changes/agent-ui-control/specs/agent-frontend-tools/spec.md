## ADDED Requirements

### Requirement: Proxy frontend tool class

workhorse-agent SHALL support a tool class whose execution does not run locally but instead emits a `tool_use` event toward the renderer and suspends until a matching `tool_result` is received, correlated by `tool_use_id`. The class SHALL reuse the agent's existing timeout, cancellation, and panic-recovery semantics.

#### Scenario: Agent invokes a frontend tool

- **WHEN** the model emits a `tool_use` for a registered frontend tool
- **THEN** the agent emits that `tool_use` over the session stream toward the renderer
- **AND** the agent suspends that tool's execution awaiting a `tool_result` with the same `tool_use_id`

#### Scenario: Frontend tool result resumes the loop

- **WHEN** a `tool_result` with a matching `tool_use_id` arrives from the renderer
- **THEN** the agent appends it to the conversation and continues the turn

#### Scenario: Frontend tool times out

- **WHEN** no matching `tool_result` arrives before the tool's timeout
- **THEN** the agent synthesizes a `tool_result` with `is_error:true` and continues, never hanging the turn

#### Scenario: Frontend tool returns an error envelope

- **WHEN** the renderer returns `{ok:false, error:{kind, message}}`
- **THEN** the agent records a `tool_result` with `is_error:true` carrying the error message

### Requirement: Dynamic per-session tool registration

workhorse-agent SHALL accept a tool catalog from the renderer at session start and merge those frontend tools into that session's tool surface only, without modifying other sessions or requiring tool definitions to be compiled into the agent.

#### Scenario: Register a catalog on session start

- **WHEN** the renderer publishes a catalog of `{name, description, inputSchema, outputSchema}` entries for a session
- **THEN** those tools become callable by the model within that session, with `inputSchema` advertised as the tool's parameters and `outputSchema` describing the result
- **AND** sessions without a published catalog have no frontend tools

#### Scenario: Catalog entries are scoped to the session

- **WHEN** two sessions publish different catalogs
- **THEN** each session's model only sees its own session's frontend tools

#### Scenario: Frontend tool name collides with a server-side tool

- **WHEN** a catalog entry's name matches an existing server-side tool in that session
- **THEN** that frontend entry is rejected (the authoritative server-side tool is retained) and the rejection is reported back in the publish result
- **AND** non-colliding entries in the same catalog still register

#### Scenario: Re-publishing replaces the session's frontend tools

- **WHEN** the renderer publishes a new catalog for a session that already has one (e.g. after a modal mounts new controls)
- **THEN** the session's frontend tool set is replaced by the new catalog
- **AND** tools removed by the new catalog are no longer callable, returning a `not_found` if invoked
