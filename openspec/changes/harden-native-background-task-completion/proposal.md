## Why

The Claude adapter currently treats a successful terminal `result` plus process exit as a completed turn but does not recognize or persist native background-task lifecycle receipts. This proves that a live Claude process cannot be marked complete, but it does not prove that a successful Headless exit has no outstanding Claude-owned work.

## What Changes

- First run a pinned, low-cost Claude Headless protocol spike that records whether native background tasks emit lifecycle events, delay terminal `result`, survive process exit, or cause a later turn while stdin remains open.
- Persist a bounded, sanitized summary of previously unknown stream event types so protocol drift and candidate background receipts remain diagnosable without retaining arbitrary event payloads.
- Define clean completion from structured native evidence only: assistant prose such as "waiting" never changes lifecycle state.
- If the verified protocol exposes Claude-owned must-join work, require the Claude Driver to keep the turn active or return an explicit non-clean terminal classification until that work settles.
- Permit explicitly detached work to remain outside the turn completion predicate only when the observed native protocol can distinguish it without trusting free-form assistant prose.
- Fail closed on contradictory terminal and outstanding-task evidence rather than publishing a false successful completion.
- Do not build a second process supervisor, infer ownership from arbitrary descendant processes, or promise interactive Claude behavior for the Headless transport before the spike proves it.
- Keep implementation gated: protocol-dependent terminal behavior may begin only after the evidence artifact identifies a stable native signal and the planning artifacts are updated if the observed protocol differs from this design envelope.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `claude-session-execution`: observe and classify verified Claude Headless background-task lifecycle evidence without using assistant prose as authority.
- `harness-driver-runtime`: require the Claude Driver to reconcile native owned-work evidence with its normalized terminal result and fail closed on contradictions.

## Impact

- The evidence spike touches only an isolated temporary workspace plus a durable repository evidence artifact; Haiku 4.5/low is the default real-model route and account-limit errors stop further real Claude tests.
- Depending on the observed protocol, `runtime/claude-headless-adapter.mjs`, `runtime/claude-code-driver.mjs`, Driver receipts, compatibility diagnostics, and adapter/supervisor tests may change.
- No model-facing tool is added. If only internal recognized-event handling changes, the implementation is hot-compatible; any exposed status, blocking vocabulary, or MCP schema change requires a new public generation and Codex task restart.
