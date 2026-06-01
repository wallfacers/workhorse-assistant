## Context

The agent's frontend tool surface has 6 tools (3 actions, 3 state readers) defined in `useAgentTabTools.ts` and `fallbackTools.ts`. All three actions return `null` on success, and error messages are terse strings without contextual hints. The JSON Schema properties lack `description` fields. This works but forces the LLM into multi-turn recovery loops when errors occur and provides no confirmation that actions succeeded.

The Go sidecar consumes tool results as opaque `tool_result` payloads — it does not parse the `value` field, only checks `{ok: true|false}`. This makes the change backward-compatible.

## Goals / Non-Goals

**Goals:**
- Action tools return structured confirmation objects instead of `null`.
- Error messages include enough context for the LLM to self-correct in a single retry.
- Every JSON Schema property has a `description` field.
- Tool descriptions use Markdown for non-trivial tools.

**Non-Goals:**
- Changing the `ToolResultEnvelope` wire format or error taxonomy.
- Changing state-reader output (already structured and LLM-friendly).
- Adding new tools or changing tool semantics.

## Decisions

### D1: Confirmation object shape

Each action tool returns a flat object with the tool's key identifiers. The `outputSchema` is updated to match.

| Tool | New return value |
|------|-----------------|
| `open_tab` | `{ opened: true, index, label, profileId }` |
| `focus_tab` | `{ focused: true, index, label }` |
| `click_by_testid` | `{ clicked: true, testId, tagName }` |

**Rationale:** Flat objects with a boolean flag (`opened`/`focused`/`clicked`) plus the tool's identifying fields let the model confirm the action without calling a reader. The Go sidecar ignores unknown fields, so this is backward-compatible.

**Alternative considered:** Return the full `get_open_tabs` list after every tab action — rejected because it inflates token usage for no added value.

### D2: Error message enrichment pattern

Error messages append a contextual hint sentence:

- Range/index errors: `"no tab at index 5; currently 3 tabs open (indices 0–2). Call get_open_tabs for the full list."`
- Enum errors: `'unknown profileId "foo"; valid values: terminal, claude-opus, claude-glm, codex'`
- Lookup errors: `'no element with data-testid="x"; visible testIds: ["btn-a", "btn-b"]'`

**Rationale:** One-sentence enrichment is cheap (a few tokens) and lets the model retry correctly without a separate diagnostic call.

### D3: Markdown in descriptions

Tool descriptions for non-trivial tools use Markdown: bold labels, inline code for parameter names, and a one-line usage example where helpful. State readers with simple descriptions stay as-is.

### D4: Schema property descriptions

Every property in `inputSchema` and `outputSchema` gets a `description` string. This is pure additive — JSON Schema consumers that ignore `description` are unaffected.

## Risks / Trade-offs

- **Token cost increase** → Each action result is ~3–5 tokens larger than `null`. Negligible per call, acceptable trade-off for reduced retry loops.
- **Go sidecar compatibility** → No risk: the sidecar treats `value` as opaque. The `outputSchema` change is informational for the model catalog only.
- **Error message length** → Enriched errors are longer but bounded. DOM-based error hints (listing visible testIds) could be large in theory, but the DOM in this app is small (< 50 elements with `data-testid`).
