## Why

The baseline can keep Claude work alive after the initiating Codex turn ends, but it does not yet provide a root-owned unread completion inbox, uniform trusted-root scoping on every normal operation, or measured resource limits. These foundations must be hardened before stable Agent Threads are layered on top, otherwise the new API would amplify ambiguous recovery and lifecycle behavior.

## What Changes

- Add a durable completion inbox scoped to the initiating Codex root, with unread cursors, bounded `wait`, and next-turn retrieval.
- Keep proactive wakeup out of the local runtime until a supported Codex host adapter exists; completion durability must not depend on unsolicited model execution.
- Canonicalize orchestration ownership as `ownerRootId`, inject it from the trusted Codex host/bootstrap boundary, migrate matching legacy `job.sessionId` values as its alias, remove model-supplied owner overrides, and retain `--all` only in a separate operator diagnostic CLI.
- Define one recoverability matrix: completed resumes normally; interrupted resumes with partial context; failed resumes only when the receipt explicitly proves resumability; cancelled work is not resumable.
- Verify terminal-state process cleanup and ensure no idle Claude process remains resident merely to preserve logical identity.
- Run controlled 1/3/6 concurrent Claude probes and use measured memory, latency, failure, and cleanup evidence before introducing any concurrency cap.
- Preserve the existing newest-100 terminal-job retention per Codex owner and keep Claude Code artifacts outside plugin cleanup.

## Capabilities

### New Capabilities

- `completion-delivery`: Durable root-scoped completion events, unread delivery, bounded waiting, and host-wakeup boundary.
- `runtime-residency`: Automatic process cleanup, non-resident terminal state, concurrency measurement, and evidence-driven capacity policy.

### Modified Capabilities

- `tracked-job-control`: Normal lookup and mutation become trusted-root scoped, operator-only diagnostic `--all` remains explicit, and follow-up obeys a precise recoverability matrix.
- `durable-runtime-state`: Durable state gains root completion inbox and cursor records while retaining bounded job receipts independently from Claude artifacts.

## Impact

- Affects `runtime/index.mjs`, internal job query/store/supervisor boundaries, CLI diagnostics, plugin lifecycle skills, schemas, and runtime tests.
- Adds completion-event and measurement artifacts inside the checkout-owned runtime state.
- May reject cross-owner direct job-ID operations that the baseline happened to permit without `--all`; this is an intentional correctness hardening.
- Does not yet rename or replace the public lifecycle API.

## Non-goals

- Creating named Agent Threads or the canonical V2 public operation set.
- Keeping a Claude process resident after its current turn reaches a terminal state.
- Adding `close`, `archive`, or manual memory-release ceremony.
- Guessing a fixed concurrency limit before the 1/3/6 probe produces evidence.
- Promising proactive Codex task wakeup without an explicit supported host integration.

## Lifecycle Order

Apply only after `establish-cc-runtime-baseline` is verified, synced, and archived. Complete this hardening change before applying `add-agent-thread-orchestration`.
