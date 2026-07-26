## Why

The current CC Agent surface can start durable Claude work, but a parent Codex Agent can end its turn while a required result is still running, receives no bounded progress while it waits, and receives only terminal status rather than enough completion content to synthesize the result. This encourages blind polling and unsafe workarounds such as asking a completed Agent to copy its answer into a temporary file.

## What Changes

- Mark all six CC Agent skills as Experimental and state the current host-wakeup and delivery limits explicitly.
- Teach the spawn/wait skills to choose among required blocking work, parallel-then-join work, and explicitly detached work; required joins must be resolved before the parent gives its final answer.
- Extend `wait_agent` with coalesced, bounded, non-sensitive progress activity so a waiting parent can see meaningful phase/tool milestones without receiving raw Claude text or tool inputs.
- Return a bounded completion handoff with the durable terminal event so the parent can synthesize the child result directly; keep the full Claude output and artifacts internal.
- Preserve nonblocking `spawn_agent`, root-scoped waiting, quiet timeouts, and two-phase completion acknowledgement.

Non-goals: automatic creation of a new Codex model turn after the parent has already ended; token-by-token streaming; exposing raw partial output, tool arguments, Claude session IDs, or internal receipts; adding a seventh lifecycle operation.

## Capabilities

### New Capabilities

- `agent-progress-delivery`: Defines bounded, coalesced, root-scoped activity delivery through `wait_agent`.

### Modified Capabilities

- `canonical-agent-orchestration`: Adds Experimental labeling, dynamic join guidance, progress/completion response shapes, and the prohibition on result-recovery workarounds.
- `completion-delivery`: Makes a bounded completion handoff model-visible while retaining durable two-phase delivery and keeping full output internal.

## Impact

The change affects the six plugin skill prompts and metadata, the Agent/job runtime wait projection, durable progress cursor/state, completion inbox projection, focused runtime tests, README/CHANGELOG documentation, and the locally installed plugin snapshot. It does not add a service, dependency on upstream Sendbird code, background Codex process, or remote runtime dependency.
