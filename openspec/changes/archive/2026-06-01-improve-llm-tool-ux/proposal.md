## Why

All three action tools (`open_tab`, `focus_tab`, `click_by_testid`) return bare `null`, giving the LLM zero feedback on what happened. Error messages lack context (e.g. "no tab at index 5" without saying how many tabs exist), forcing multi-turn recovery cycles. JSON Schema properties have no `description` fields, and tool descriptions are plain prose — both reduce model comprehension.

## What Changes

- **Action tools return structured confirmations** instead of `null` (e.g. `{ focused: true, index: 0, label: "claude-opus" }`).
- **Error messages include self-repair context**: valid ranges, available options, or suggested next steps.
- **JSON Schema properties gain `description` fields** so the model understands each parameter without guessing.
- **Tool descriptions use Markdown** (bullet lists, inline code, short examples) for non-trivial behaviour.

## Capabilities

### New Capabilities

_(none — this is a quality improvement to existing tools, not a new feature)_

### Modified Capabilities

- `ui-control-surface`: action output schemas change from `{type:"null"}` to structured objects; error messages gain contextual hints; schema properties gain `description` fields; tool descriptions adopt Markdown formatting.

## Impact

- **Code**: `src/components/terminal/useAgentTabTools.ts` (all 4 tools), `src/agent/fallbackTools.ts` (2 tools) — handler return values and `ToolError` messages change.
- **Contract**: `outputSchema` in `ToolCatalogEntry` changes for 3 action tools; the Go sidecar receives richer `tool_result` payloads (backward-compatible — unknown properties are ignored).
- **Spec**: `ui-control-surface` spec scenarios updated to reflect new output shapes and error patterns.
