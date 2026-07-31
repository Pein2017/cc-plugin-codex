## Why

A real long-running Codex session issued 558 model-facing `wait_agent` calls for 56 CC Agents: only 75 returned completion, while 228 timed out and 253 returned advisory progress, including 139 low-value hook milestones. The current prompt recommends sparse completion-first waiting, but the typed MCP schema still permits short observation windows and unlimited per-call progress wakeups, so prompt guidance alone does not bound repeated model/tool turns.

## What Changes

- **BREAKING** Remove `timeout_ms` from the model-facing MCP `wait_agent` schema; model calls use the fixed 600000 ms completion-first upper bound, while checkout CLI/runtime diagnostics retain explicit bounded timeouts.
- Retain explicit `wake_on_progress`, but allow at most one advisory progress delivery per active Agent job/turn before subsequent waits become completion-first for that job.
- Exclude hook activity from model-facing progress delivery while retaining it in private runtime evidence.
- Align the wait tool and Skill guidance with Codex Multi-Agent V2: work locally after asynchronous spawn, wait only on a critical-path join, and never repeat progress waits reflexively.
- Add regression coverage for short-timeout rejection at the typed MCP boundary, per-job progress exhaustion, hook suppression, prompt/tool guidance, and immediate completion return within the fixed upper bound.
- Do not change Agent execution lifetime, durable completion acknowledgement, operator/debug timeout support, release metadata, or installed Plugin snapshots.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `typed-mcp-orchestration`: Make the model-facing wait timeout fixed and hide per-call timeout selection while preserving runtime/operator diagnostics.
- `agent-progress-delivery`: Bound advisory progress to one delivery per active Agent job and suppress hook-only progress.
- `canonical-agent-orchestration`: Make completion-first critical-path joining the enforced canonical workflow rather than prompt-only advice.

## Impact

Affected surfaces are `runtime/mcp-server.mjs`, Agent/job progress state and selection, the wait Skill, focused runtime/MCP integration tests, and the three listed OpenSpec capabilities. `runtime/index.mjs` remains the lifecycle owner; no dependency, environment, Claude process, version, release, installation, or Cache behavior changes.
