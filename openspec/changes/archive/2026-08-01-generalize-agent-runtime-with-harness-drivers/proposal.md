## Why

The current Plugin already owns a durable logical Agent lifecycle, but its public owner and durable records still assume every turn is executed by Claude Code. The approved north star is one deterministic, harness-neutral supervisor under a Codex lead, with coarse turn-level adapters for Claude Code first, Codex Exec second, and only later other proven agent harnesses; separating those responsibilities now prevents Claude-specific session and transport semantics from becoming the permanent multi-harness contract.

## What Changes

- Introduce an internal Harness Driver contract at the complete-turn boundary. The shared supervisor continues to own Agent identity, root ownership, mailbox, jobs, leases, completion delivery, reconciliation, and wait semantics; each driver owns its executable, configuration, model catalog, turn transport, session evidence, interruption, history, compatibility, and failure detectors.
- Put the existing Claude Code execution path behind the first `claude-code` driver without changing its observable lifecycle, terminal-parity configuration, live steering acknowledgement, exact-session recovery, transcript history, bounded Fable orchestration, receipts, or public seven-operation API.
- Introduce explicit version-2 Agent and job state capable of naming a Harness, immutable Harness/model/topology route, per-turn effort and write intent, neutral native-session reference, driver version, capability snapshot, and Harness-scoped session lease. Existing version-1 state is interpreted only as Claude Code, remains readable, and is never rewritten while owned by an active version-1 worker.
- Define an explicit capability vocabulary so the future supervisor can reject or report unsupported behavior rather than pretending every Harness supports Claude-style active input, history, graceful interruption, recovery, or native orchestration.
- Keep all intelligent routing in the Codex lead and `agent-routing` policy. The supervisor validates and records an explicit route but never decomposes tasks, selects a Harness/model/effort, performs automatic fallback, or substitutes across quota failures.
- Require the completed `bound-model-facing-agent-wait` change to be fixed into the owning specifications before this change is implemented; its fixed completion-first wait, one-progress-per-turn budget, and hook suppression become shared-supervisor invariants.
- Explicitly defer the Codex Exec driver, Luna model calls, public `harness` parameter, mixed-Harness smoke, `pein-agents` rename, Grok/Kimi integration, release, installation, and Cache changes to later OpenSpec changes.

## Capabilities

### New Capabilities

- `harness-driver-runtime`: Defines the coarse turn-level Harness Driver boundary, capability vocabulary, deterministic driver registry, Claude behavior-preserving first adapter, and the separation between lead routing policy and supervisor lifecycle.

### Modified Capabilities

- `agent-thread-registry`: Generalizes durable Agent identity from Claude-specific session fields to versioned Harness, immutable route, topology, and neutral native-session references while preserving version-1 Claude state.
- `durable-runtime-state`: Generalizes jobs, session leases, process receipts, recovery evidence, and migration rules across Harness instances without weakening crash or ownership invariants.
- `claude-session-execution`: Requires the extracted Claude Code driver to preserve the existing headless stream-json, configuration, steering, recovery, history, authority, and topology contracts exactly.
- `local-runtime-boundary`: Makes Harness executables and credential/config stores explicit external dependencies behind checkout-owned in-tree drivers, without allowing model-facing executable, environment, or adapter selection.

## Impact

Planning affects the public lifecycle owner in `runtime/index.mjs`, Agent composition in `runtime/agent-runtime.mjs`, the internal turn runtime and supervisor, durable Agent/job/session schemas, Claude execution/profile/compatibility/history modules, MCP contract tests, fake-Harness fixtures, migration fixtures, and the four listed specifications. This change introduces no new runtime dependency, no remote or versioned-Cache source, no raw model-provider API, no public tool/schema generation change, and no release action.
