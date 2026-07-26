## Why

Before the launcher proves a Claude child has started, an attached-job crash is
currently reconciled as a real failed turn: it publishes a false completion and
acknowledges an `initial_prompt` Claude never consumed. The same premature
boundary lets invalid execution options pass public spawn, fail only inside the
worker, and leave a newly created Agent permanently blocked.

## What Changes

- Validate the complete execution profile synchronously before readiness,
  Agent creation, mailbox assignment, or job reservation.
- Treat both unattached and attached `preClaudeLaunch` receipts as non-turn
  diagnostics until a real Claude child-spawn receipt durably clears that
  marker.
- On a terminal pre-Claude receipt, suppress Agent completion/session binding,
  restore the Agent's prior lifecycle, and requeue every assigned or stale-
  dispatched mailbox message without acknowledgement.
- Record that the diagnostic was reconciled so restart passes are idempotent and
  bounded retention can eventually prune it.
- Preserve normal post-launch terminal projection and `initial_prompt`
  acknowledgement once durable evidence says the prompt could have reached
  Claude.
- **Non-goals:** changing the six public APIs, replaying ambiguous post-launch
  work, changing Claude sessions/artifacts, or adding a new retry policy.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `canonical-agent-orchestration`: Require complete execution-option validation
  before public spawn or activating follow-up can mutate durable Agent state,
  and persist the first-turn prompt in the Agent mailbox before activation.
- `tracked-job-control`: Define the durable child-launch handshake that separates
  a recoverable pre-Claude diagnostic from a turn that may have delivered input.
- `agent-thread-registry`: Clarify restart recovery and mailbox handling for a
  terminal activation that attached to an Agent but never crossed the durable
  Claude-launch boundary.

## Impact

The change affects execution-option validation, prepared-job/child-spawn
ordering, terminal completion suppression, Agent reservation recovery, mailbox
acknowledgement, and bounded cleanup. It does not change public arguments,
persisted required fields, plugin discovery, or Claude session artifacts.
Verification is entirely local/fake and does not consume Claude quota.
