## Why

The model-facing wait window is already completion-first and one hour long, but the isolated runtime worker still rereads durable completion and job files every 500 ms. A quiet one-hour call can therefore perform roughly 7,200 local scans even though no additional model tokens are spent.

## What Changes

- Replace the normal 500 ms wait loop with ephemeral filesystem-event wakeups inside the existing isolated MCP call worker.
- Keep durable completion inboxes and job files as the only truth; watcher events are hints that trigger a fresh validated read.
- Close the read/watch race with an observe-register-observe sequence and keep completion priority plus the existing final zero-time observation.
- Watch directories rather than atomically replaced files, rebuild watch coverage when directories appear, and never create persistence paths merely to observe them.
- Retain a low-frequency recovery scan for dropped/coalesced events and a bounded polling fallback only when watchers cannot be established.
- Preserve abort, deadline, root isolation, quiet-wait zero-write, progress opt-in, at-least-once delivery, and acknowledgement semantics.
- Add deterministic instrumentation tests for durable read count, wake latency, fallback recovery, watcher cleanup, and coalesced completion behavior without exposing metrics to the model-facing API.
- Implement this change before `add-targeted-barrier-agent-join`; the later change reuses the wake primitive but remains a separate public-generation contract.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `completion-delivery`: make bounded durable wait event-woken in the supported Linux path while retaining durable fact reads and recovery observation.

## Impact

- `runtime/internal-runtime.mjs`, completion/job path helpers, isolated-worker wait cleanup, and focused wait persistence/progress/concurrency tests are affected.
- The seven MCP tools, their schemas, receipts, acknowledgement tokens, Agent states, and one-hour model-facing upper bound do not change; this is hot-compatible when implemented alone.
- No daemon, socket, resident forwarding process, external dependency, or versioned cache path is introduced.
