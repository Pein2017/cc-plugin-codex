## Why

The current model-facing `wait_agent` observes one root-wide FIFO completion at a time. In a parallel delegation, an unrelated or historical completion can wake a lead that is waiting for a specific turn, and the global contiguous acknowledgement cursor forces the lead to drain and echo tokens in inbox order before it can finish the intended join.

## What Changes

- Add an optional exact `targets` array to the existing `wait_agent` operation; no targets preserves the current root-wide next-activity behavior.
- Define one target as a targeted join and multiple targets as a fixed barrier that waits for every snapshotted target turn to settle.
- Bind each target once to its current Agent and concrete active or latest job so later spawns and follow-up turns cannot extend the join.
- Prevent unrelated completions and progress from waking, freezing, or being acknowledged by a targeted join.
- Replace the completion inbox's single contiguous acknowledgement rule with per-event acknowledgement plus a derived contiguous compaction watermark, while preserving frozen at-least-once delivery and restart-safe redelivery.
- Return enough per-target settled, blocked, non-joinable, and timeout state to avoid `list_agents` polling after a targeted wait.
- Keep the public surface small: do not add `join_agents`, a target-subset `any` mode, persisted barrier objects, cancellation, or implicit Agent activation.
- Implement after `replace-wait-polling-with-event-wakeup` and reuse that accepted internal wake primitive; the ordering is an implementation dependency, not a public API dependency.
- Keep `harden-native-background-task-completion` independent; targeted join consumes only durable supervisor job facts and does not infer state from Claude assistant prose.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `canonical-agent-orchestration`: extend `wait_agent` with fixed one-turn targeted and barrier joins while preserving the untargeted V2-shaped path.
- `completion-delivery`: admit selective delivery and acknowledgement without losing, rewriting, or starving unrelated completion events.
- `typed-mcp-orchestration`: expose and validate the additive `targets` input and bounded aggregate join receipt through the existing tool.

## Impact

- Public MCP schema and wait Skill guidance change, so a new Codex task is required after promotion to discover the new argument and receipt shape.
- `runtime/agent-runtime.mjs`, `runtime/internal-runtime.mjs`, `runtime/completion-inbox.mjs`, Agent store projections, MCP registration, CLI diagnostics, and focused runtime/plugin tests are affected.
- Existing calls that omit `targets` retain their current behavior. No new runtime dependency, Harness dependency, or plugin-cache ownership is introduced.
