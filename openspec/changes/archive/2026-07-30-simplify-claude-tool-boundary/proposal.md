## Why

The public `allowed_tools` field suggests a restrictive capability boundary even though terminal-parity bypasses permission checks and inherits Claude Code's full tool surface. At the same time, leaf Agents deny `Agent` but still expose Claude Code's `Workflow` orchestration tool, leaving an unintended path around the bounded delegation topology.

## What Changes

- **BREAKING** Remove `allowed_tools` from the public `spawn_agent` and `followup_task` contracts; supported turns inherit the native Claude Code tool surface by default.
- Deny `Workflow` for every CC Agent activation.
- Continue denying `Agent` for leaf Agents, while allowing only explicit `claude-fable-5` `claude_orchestrator` Agents to use native `Agent` delegation.
- Tell a bounded Claude Agent to end its turn with the precise question and evidence when progress requires a decision that only the Codex lead or user can make.
- Preserve full-access terminal parity for both values of `write`; `write: false` remains a behavioral prompt boundary rather than a process sandbox.
- Non-goals: changing hook inheritance, adding new delegation modes, filtering the remaining native tools, changing model routing, or altering completion and wait semantics.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `canonical-agent-orchestration`: Simplify activation inputs and make the native delegation boundary explicit.
- `claude-session-execution`: Deny `Workflow` independently of write intent and add the lead-owned blocking-question escape hatch.
- `typed-mcp-orchestration`: Remove `allowed_tools` from typed MCP schemas and reject it as an unknown input.

## Impact

This changes the seven-skill Plugin contract, MCP schemas, runtime option plumbing, Claude execution-profile prompt/tool overrides, compatibility receipts, documentation, and focused/runtime integration tests. Existing callers that pass `allowed_tools` must stop doing so; all other native tools remain available under terminal parity.
