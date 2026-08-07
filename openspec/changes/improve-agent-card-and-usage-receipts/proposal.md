## Why

CC for Pein already delivers durable identity, event-driven joins, and complete
completion messages, but ordinary model-facing state still collapses active work
to `starting` or `working` and completion receipts omit the bounded usage facts
Claude Code reports. Leads therefore cannot distinguish a recently active turn
from a quiet one or compare route cost without falling back to operator internals.

## What Changes

- Extend the existing spawn and list projections with one compact Agent Card:
  exact selected model, requested effort when known, explicit behavioral
  authority, immutable delegation mode, safe observed phase, start/activity
  timestamps, and query-time elapsed seconds. Missing or pruned evidence remains
  `null`; no liveness inference is made from elapsed time.
- Normalize a closed set of non-negative numeric metrics from Claude's terminal
  result event: duration, API duration, turn count, token usage, and
  Claude-reported cost when present. Add Plugin-observed tool-call and attempt
  counts without exposing tool inputs, paths, commands, or raw terminal events.
- Persist the normalized metrics through the Driver result, terminal job,
  completion inbox, frozen first-delivery payload, targeted barrier receipt, and
  restart redelivery. Pre-change jobs and already-frozen events project
  `metrics: null` rather than being recomputed.
- Keep model-facing presentation concise. Agent Card and completion metrics are
  structured evidence; Skills summarize them only when relevant and do not dump
  JSON by default.
- Reduce repeated model instructions by keeping shared join policy in MCP server
  instructions and retaining only operation-specific differences in tool
  descriptions. Correct the stale README version/wait comparison.

Explicit non-goals:

- No new `delegate`, `message_agent`, status, archive, close, delete, callback,
  notification, pricing, or automatic acknowledgement operation.
- No attempt to reactivate an ended Codex turn or recover a join across a foreign
  owner root. The active `wait_agent` event-wakeup boundary remains unchanged.
- No `yield_after_ms`, shorter wait, targeted-progress barrier, repeated polling,
  or change to completion-first priority.
- No filesystem sandbox. `write` remains behavioral authority under full-access
  terminal parity; the new public value makes that boundary legible.
- No inferred `files_read`, `tests_running`, modified-file set, heartbeat,
  `needs-input`, verdict, acceptance, or actual subscription charge. Claude
  prose, tool arguments, elapsed silence, and a static price table are not facts.

Lifecycle ordering: this change builds on the released event-wakeup, targeted
barrier, and actionable-blocking contracts. It preserves their delivery and
recovery semantics while extending the exact frozen payload. A single integrator
must own parser-to-inbox propagation before the fixed tree receives an
independent silent-correctness review.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `canonical-agent-orchestration`: spawn/list presentation gains a compact,
  evidence-only Agent Card while the seven-operation lifecycle stays unchanged.
- `typed-mcp-orchestration`: additive structured receipts expose Agent Card and
  normalized completion metrics, and common instructions are de-duplicated
  without changing inputs or join behavior.
- `agent-progress-delivery`: the latest already-persisted safe phase may be
  observed in an explicit logical Agent listing without consuming progress or
  changing completion state.
- `harness-driver-runtime`: a Driver result gains a closed optional metrics
  projection derived only from native terminal evidence and Plugin counters.
- `claude-session-execution`: the Claude Code Driver sanitizes supported terminal
  usage fields and rejects arbitrary, negative, non-finite, or payload-bearing
  values from public projection.
- `completion-delivery`: normalized metrics travel with new completion events and
  frozen first delivery while legacy and pre-change frozen payloads remain
  immutable and compatible.

## Impact

The main implementation seam is
`runtime/claude-headless-adapter.mjs` -> `runtime/claude-code-driver.mjs` ->
`runtime/job-supervisor.mjs`/`runtime/job-store.mjs` ->
`runtime/completion-inbox.mjs` -> `runtime/agent-runtime.mjs`. The typed MCP
projection, seven Skills, README, focused fixtures, fake-Claude integration, and
release-smoke contract assertions also change. No dependency, environment,
Harness selector, external service, raw provider API, Cache runtime, or remote
source is added.
