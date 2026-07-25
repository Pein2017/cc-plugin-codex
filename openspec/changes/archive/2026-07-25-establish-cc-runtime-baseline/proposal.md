## Why

CC for Pein already has a substantial checkout-owned Claude Code runtime, but it was implemented before this repository adopted OpenSpec. We need one explicitly retroactive baseline anchored to commit `5303a35` so later hardening and Agent Thread work can describe real deltas instead of inventing historical changes or treating upstream code as authority.

## What Changes

- Record the verified behavior of the current local runtime as the initial stable specification.
- Establish the local checkout as the sole source and runtime dependency; installed plugin Cache copies are deployment artifacts, not source authority.
- Specify the existing Claude headless execution profiles, environment loading, session capture/resume, tracked jobs, steering mailbox, receipts, process control, CLI-only waiting, and transport recovery behavior.
- Record the seven currently exported public lifecycle operations as baseline behavior only; `wait` is an internal/CLI facility, not an eighth public export. Their replacement by a Codex Multi-Agent V2-aligned API belongs to `add-agent-thread-orchestration`.
- Add traceability and verification tasks for the existing implementation without representing this baseline as a new implementation.

## Capabilities

### New Capabilities

- `local-runtime-boundary`: Checkout ownership, source-root enforcement, environment-file loading, and independence from upstream repositories and versioned Cache paths.
- `claude-session-execution`: Claude Code headless invocation, safe and terminal-parity execution profiles, streaming receipts, and exact-session continuation.
- `tracked-job-control`: Existing start, live steer, follow-up, interrupt, cancel, status, result, and wait lifecycle behavior for tracked Claude jobs.
- `durable-runtime-state`: Durable job records, mailboxes, process identities, session leases, retention, and restart-safe recovery receipts.

### Modified Capabilities

None. This repository has no prior local OpenSpec capability baseline.

## Impact

- Adds repo-local OpenSpec authority under `openspec/`.
- Maps specifications to `runtime/`, `plugins/cc-for-pein/`, environment configuration, and runtime-focused tests.
- Introduces no intended runtime behavior change. Any discrepancy found while validating the baseline must be recorded as a follow-up hardening task rather than silently rewriting the claimed baseline.

## Non-goals

- Reconstructing fictitious OpenSpec history for work completed before commit `5303a35`.
- Preserving compatibility with Sendbird or any other upstream plugin API.
- Introducing Agent Threads, proactive host wakeups, archive semantics, or a new MCP server.
- Changing current runtime behavior as part of baseline establishment.

## Lifecycle Order

This baseline is first. `harden-runtime-foundations` may then correct foundation-level gaps against it, and `add-agent-thread-orchestration` may finally replace the public lifecycle surface while building on the hardened runtime.
