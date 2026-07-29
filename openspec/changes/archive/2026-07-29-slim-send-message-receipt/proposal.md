## Why

`send_message` currently returns and instructs the parent to repeat the complete internal mailbox record, including the original message text, timestamps, IDs, and steering metadata. Most of that evidence is irrelevant to orchestration and consumes both model context and visible output tokens.

## What Changes

- **BREAKING:** Reduce the successful model-facing `send_message` receipt to the stable Agent path and delivery disposition required for the parent's next decision.
- Keep the full mailbox message, assignment, job, and steering evidence in existing durable runtime storage and operator diagnostics rather than the public receipt.
- Replace the Skill's raw-receipt instruction with one concise human-readable confirmation and reserve raw/debug detail for explicit user requests.
- Preserve actionable errors and the distinct `dispatched_active`, `activation_pending`, and `queued_no_turn` outcomes.

Non-goals:

- Changing message durability, ordering, activation behavior, Claude delivery, or Agent lifecycle.
- Slimming other lifecycle receipts in this change.
- Adding another tool, receipt lookup API, or duplicate MCP-side state.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `canonical-agent-orchestration`: Define the minimal successful `send_message` receipt and concise parent presentation.
- `typed-mcp-orchestration`: Preserve structured MCP transport while allowing operation-specific bounded public receipts instead of internal records.

## Impact

Affected areas include the public Agent runtime projection, `send-message` Skill and discovery metadata, README/CHANGELOG, minor Plugin version metadata, and focused runtime/MCP/contract tests. Durable storage schemas and the seven-operation catalog do not change.
