## Why

The fixed 10-minute model-facing join still wakes Codex during normal long
Claude/Fable turns, causing another inference, timeout narration, redundant
`list_agents` checks, and repeated `wait_agent` calls even though the Agent is
healthy. New screenshots show a required audit crossing that boundary at about
11 minutes, so the prior bound is now the dominant remaining polling trigger.

## What Changes

- Extend the model-facing completion-first `wait_agent` observation window from
  600000 ms to 3600000 ms while preserving immediate completion and progress
  return.
- Preserve host cancellation: new user input or caller cancellation stops only
  the wait observation and leaves the detached CC Agent running.
- Strengthen model-facing `wait_agent` and `list_agents` guidance so a quiet
  timeout is followed directly by another required join, without narration or
  a status/list/history probe made solely to recheck completion.
- Keep `wake_on_progress` explicitly opt-in and limited to one useful public
  progress update per Agent job.
- Do not add automatic wait-after-spawn, a combined delegate operation,
  background-terminal state, batch completion delivery, or acknowledgement
  changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `canonical-agent-orchestration`: Change the fixed model-facing join bound to
  one hour and make direct quiet-timeout rejoin the canonical required-work
  behavior.
- `typed-mcp-orchestration`: Keep the MCP transport margin above the one-hour
  runtime observation and make list/status guidance explicitly non-polling.

## Impact

The change affects the typed MCP wait translation, tool descriptions and server
instructions, wait/list Skills, README guidance, focused contract tests, and
the two listed specifications. It changes no MCP input or output schema,
API generation, Claude execution lifetime, completion delivery, durable
acknowledgement, dependency, environment, release, installation, or Cache
behavior.
