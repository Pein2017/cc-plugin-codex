## Why

`spawn-agent` currently instructs Codex to print the complete runtime receipt,
which exposes implementation metadata and overwhelms the useful confirmation
that a named Agent started. The durable receipt is still necessary internally,
but it does not need to be the default user-facing response.

## What Changes

- Make the `spawn-agent` skill report a concise acknowledgement containing the
  stable Agent path and current status instead of dumping the raw JSON receipt.
- Permit the complete receipt only when the user explicitly requests raw or
  debug output.
- Pin the skill's two supported model selections to exact Claude Sonnet 5 and
  Opus 5 IDs, keep model and effort as separate arguments, and forbid partial
  identifiers or silent fallback.
- Replace the runtime's stale 4.x alias table with a strict two-model whitelist
  and name each new Claude Agent session so Claude Code does not invoke Haiku to
  generate an automatic session title.
- Apply the explicit Opus 5 default to both safe and terminal-parity execution
  so an unrestricted configured default cannot select a third model.
- Keep runtime return values, persistence, reconciliation, and lifecycle
  ordering unchanged.
- Non-goals: changing the other five lifecycle skills, hiding runtime failures,
  or removing any durable receipt field.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `canonical-agent-orchestration`: Define concise default presentation for a
  successful `spawn-agent` skill invocation and exact two-model selection.
- `claude-session-execution`: Name initial Agent sessions so execution uses only
  the selected Sonnet 5 or Opus 5 model in the verified headless path.

## Impact

The change affects the `spawn-agent` skill instructions, Claude argument
construction, stored internal request metadata, contract/adapter tests, release
metadata, and documentation. The six-operation public runtime shape is
unchanged. Model availability remains owned by the active Claude account and is
reported honestly at launch time.
