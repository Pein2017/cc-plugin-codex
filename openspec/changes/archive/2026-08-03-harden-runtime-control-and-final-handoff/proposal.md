## Why

Independent Sol/max and Fable/max reviews of commit `18038bb` found that the
public seven-Agent surface is sound, but several production paths can still
misstate process ownership, expose the wrong Claude message as the final handoff,
or promote untrusted assistant prose into a Harness-wide stop. These gaps survive
the current green test suite and should be closed before the next local release.

## What Changes

- Make a verified live detached supervisor retain job and native-session
  ownership even after its Claude child exits and before the terminal CAS lands.
- Report Linux interrupt, cancel, and liveness outcomes truthfully: only `ESRCH`
  means absence; permission and invalid-operation failures remain explicit
  control failures and cannot synthesize a terminal success.
- Define a completed turn's `finalMessage` as the latest complete top-level
  Claude outer-assistant message, excluding earlier tool-boundary narration while
  preserving complete, untruncated final text.
- Restrict Harness-scoped auth/account-limit classification to native terminal,
  stderr, or structured API evidence rather than Agent-authored final prose.
- Byte-bound persisted activity receipts, enforce owner-only runtime/log modes,
  redact private lifecycle identifiers from model-facing MCP errors, and reject
  semantically impossible stored blocking triples.
- Restore compatibility shells only from an admitted discovery-only file set.
- Repair the explicit paid Haiku release smoke after the fixed model-facing wait
  change, and clarify completion acknowledgement, activation-pending steering,
  and operator-only timeout semantics in the Skill/MCP/README contracts.
- Add focused zero-Claude regression tests for every review counterexample, then
  run the complete unit and fake-Claude integration gates.

Non-goals: changing the seven public operations, adding archive/cancel/delete,
adding another Harness Driver, changing terminal-parity permissions, introducing
automatic paid probes, installing or releasing the Plugin, pruning historical
state, or adding power-loss fsync machinery in this change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `tracked-job-control`: live supervisor ownership, Linux control truthfulness,
  and owner-only job/log persistence become fail-closed invariants.
- `claude-session-execution`: final-message selection and Harness-scoped failure
  evidence are narrowed to their authoritative native sources.
- `harness-driver-runtime`: normalized Driver receipts become byte-bounded and
  retain only admitted activity metadata.
- `completion-delivery`: completion handoff is exactly the latest complete
  outer-assistant message and stored blocking triples are cross-field valid.
- `typed-mcp-orchestration`: public lifecycle errors and acknowledgement guidance
  no longer leak or obscure private runtime state.
- `local-runtime-boundary`: compatibility-shell restoration is discovery-only by
  construction.
- `plugin-release-readiness`: the explicit Haiku smoke uses the fixed model-facing
  wait contract and is exercised without relying on a stubbed production loop.
- `canonical-agent-orchestration`: activation-pending steering and completion
  acknowledgement obligations are stated precisely without adding operations.

## Impact

The change affects Linux process control, job/session lease reconciliation,
Claude stream-json parsing and failure classification, durable receipts and file
modes, MCP error projection, local compatibility-shell refresh, release smoke,
the seven Skill descriptions, and their focused/runtime-integration tests. It
adds no production dependency and does not change the checkout-owned source or
fixed environment boundaries.
