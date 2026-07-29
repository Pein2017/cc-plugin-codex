## Why

`wait_agent` currently treats advisory progress as ordinary root activity, so a joined Agent can wake the parent every 5 to 30 seconds even when the parent only needs the final result. In observed use this produced 213 wait calls for 21 spawns, adding model turns and orchestration noise without improving completion delivery.

## What Changes

- Make `wait_agent` completion-first by default: absent an explicit progress request, it returns unread completion activity or the bounded timeout and does not claim advisory progress.
- Add an optional `wake_on_progress` boolean for a caller that intentionally wants one intermediate progress observation during that specific wait call.
- Preserve completion priority, root ownership, ten-minute default timeout, one-hour maximum, and two-phase completion acknowledgement.
- Update the wait Skill and public descriptions to tell the lead to wait sparingly, do useful parent work first, and use progress wakeup as a one-shot observation rather than a polling mode.
- Keep the existing seven operations and durable progress projection; this change alters only when advisory progress may wake a public wait.

Non-goals:

- Adding a combined delegate operation, eighth tool, background waiter, push notification, or persistent monitoring mode.
- Changing Agent completion storage, acknowledgement tokens, Claude session ownership, or the completion inbox.
- Removing progress receipts or changing their privacy and redaction boundaries.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `canonical-agent-orchestration`: Define completion-first joins, explicit one-shot progress wakeup, and sparse lead waiting policy.
- `agent-progress-delivery`: Make advisory progress opt-in at the wait boundary without advancing its cursor during ordinary completion waits.
- `completion-delivery`: Preserve durable completion and acknowledgement semantics while making progress an explicit optional observation.
- `typed-mcp-orchestration`: Expose the optional `wake_on_progress` input while preserving asynchronous Agent execution and bounded transport behavior.

## Impact

Affected areas include the runtime wait boundary, Agent lifecycle adapter, MCP input schema and descriptions, operator CLI, `wait-agent` Skill, README/CHANGELOG, package and Plugin version metadata, and focused runtime/contract tests. Existing callers that omit the new input remain schema-compatible but receive the quieter completion-first behavior; discovering and using the new field requires the next installed Plugin version and a new Codex task.
