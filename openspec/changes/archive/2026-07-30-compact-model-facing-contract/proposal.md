## Why

The durable runtime is reliable, but successful lifecycle calls still expose and restate more orchestration detail than the Codex lead needs. Compact operation-specific receipts and shorter guidance will reduce recurring context and output tokens without changing Agent identity, recovery, waiting, or Claude final-message fidelity.

## What Changes

- **BREAKING** Replace successful `spawn_agent`, `followup_task`, and `interrupt_agent` model-facing receipts with minimal operation-specific projections.
- Make all seven Skills present successful calls concisely and never require raw receipt echoing unless the user explicitly asks for debug detail.
- Reduce duplicated Skill prose, typed MCP descriptions, and the appended Claude delegation envelope while preserving every authority, model, delegation, recovery, and account-limit invariant.
- Increment the MCP API generation and pre-1.0 minor release because discovered result shapes change.
- Keep `wait_agent` complete final messages, delivery acknowledgement, progress policy, timeouts, and the seven-operation lifecycle unchanged.
- Do not add a delegate wrapper, new state, new lifecycle operation, message cap, or alternate transport.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `canonical-agent-orchestration`: Define minimal spawn/follow-up/interrupt success projections and concise Skill presentation while preserving actionable failures and complete wait delivery.
- `typed-mcp-orchestration`: Bind successful MCP output to the new compact runtime projections and advertise the incompatible schema generation.

## Impact

The change affects `runtime/agent-runtime.mjs`, typed MCP metadata, Agent Skill guidance, release/version metadata, documentation, and focused runtime/integration tests. Durable Agent records, Claude session history, job receipts, operator diagnostics, `runtime/index.mjs`, host environment, and the seven public operation names remain unchanged.
