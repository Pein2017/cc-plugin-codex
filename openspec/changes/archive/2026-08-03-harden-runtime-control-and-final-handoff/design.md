## Context

The checkout already provides durable Agents, detached workers, Claude session leases, a completion inbox, and a seven-operation MCP surface. Independent review found that several narrow implementation choices can violate those contracts: a dead Claude child can mask a still-live supervisor, Linux signal failures can be reported as success, the streaming parser can concatenate intermediate assistant narration into the final handoff, and model-generated prose can be mistaken for Harness failure evidence.

This change hardens those existing boundaries without expanding the public API or changing terminal-parity permissions. The local checkout remains the only source and runtime owner; installation and release are outside this change.

## Goals / Non-Goals

**Goals:**

- Make verified supervisor residency authoritative until terminal state is durably committed.
- Treat only `ESRCH` as proof that a Linux process or process group is absent.
- Return exactly the latest top-level Claude outer-assistant message as the untruncated final handoff.
- Keep Harness-wide failure classification grounded in native runtime evidence rather than assistant prose.
- Bound and protect persisted runtime evidence, redact private identifiers at the MCP boundary, and reject impossible blocking tuples.
- Keep compatibility shells and paid release smoke aligned with the current public contract.
- Add focused zero-Claude regression coverage and retain the full repository gate.

**Non-Goals:**

- Add, remove, or rename public Agent operations.
- Add archive, delete, cancellation, automatic paid probes, or a new Harness Driver.
- Change terminal-parity permissions, model routing, delegation depth, or environment ownership.
- Add state pruning, transcript indexing, fsync policy, or history performance work.
- Install, publish, or release the Plugin.

## Decisions

### Residency is the union of verified worker and child ownership

A job is active when either its detached worker identity or its Claude child identity is verified live. A live worker remains authoritative during the normal interval after the child exits and before the worker commits the terminal CAS. Reaping and session-lease acquisition use the same helper so their ownership decisions cannot drift.

Using only `job.pid ?? job.workerPid` was rejected because a stale child PID can hide the live supervisor. Treating any unverified PID as active forever was also rejected because it would prevent stale-state recovery; identity mismatches remain explicit recovery evidence.

### Signal outcomes are classified, not coerced to success

Signal helpers return an explicit outcome. `ESRCH` means absent and is idempotent success. Other failures, including `EPERM`, remain control failures and must not be used as liveness proof or termination success. Callers preserve current interrupt semantics while surfacing truthful failure evidence.

### Stream parsing tracks top-level message boundaries

The Claude Driver keeps progress aggregation separate from final-result selection. It records each top-level assistant message between stream message boundaries and chooses the latest completed outer-assistant message. A terminal aggregate is only a fallback when no complete message boundary was observed. The selected final message is not size-truncated.

This is preferred over suffix heuristics because tool use can create several assistant messages and terminal aggregates can repeat earlier narration.

### Harness failures require native evidence

Account, authentication, transport, and process failure classifiers consume structured terminal data, stderr, warnings, and exit evidence. `finalMessage` remains Agent output and cannot independently produce a Harness-scoped blocking result. Agent prose can still describe a problem, but the lead decides how to act on it.

### Persisted evidence is minimal, bounded, and private by default

Tool activity stores bounded names, input-key summaries, and already-bounded touched-file evidence rather than arbitrary tool input values. Runtime-created directories and logs use owner-only modes. MCP error projection replaces private native session IDs, internal job IDs, and absolute runtime paths with stable public wording. Persisted blocking objects are validated as coherent reason/scope/retry tuples.

### Compatibility shells are reconstructed from a whitelist

Refresh copies only the discovery descriptors and bootstrap files required to redirect an already-loaded shell to the checkout. Arbitrary content from an older cache snapshot is never copied forward. This preserves hot-update compatibility without turning the cache into a source dependency.

### Release smoke exercises the public schema

The optional paid Haiku/low loop calls `wait_agent` without removed timeout arguments and follows the same completion-token acknowledgement contract as model-facing callers. A zero-Claude fake transport test covers the real loop so schema drift cannot hide behind a stubbed probe.

## Risks / Trade-offs

- **[Risk] A conservative signal failure can leave a process running longer.** → Preserve explicit failure evidence and require a later verified retry instead of claiming success.
- **[Risk] Older stream-json variants may omit message boundaries.** → Retain terminal-result fallback only when no complete outer-assistant message was observed.
- **[Risk] Redaction can make operator diagnosis less convenient.** → Keep full evidence in owner-only local state while exposing stable public error categories.
- **[Risk] Tight compatibility-shell whitelisting can miss a future discovery file.** → Cover the exact installed layout in refresh tests and update the whitelist with the descriptor contract.
- **[Risk] Permission repair changes modes on existing runtime artifacts.** → Restrict repair to Plugin-owned runtime directories and logs.

## Migration Plan

No persisted schema migration is required. Existing jobs and Agents are read through stricter validators; incoherent legacy blocking data is treated as invalid rather than silently trusted. Local implementation is verified with focused tests, `openspec validate --strict`, and `npm run check`. Installation and release remain separate explicit operations.

## Open Questions

None for this change. Storage pruning, transcript indexing, fsync hardening, and generalized Harness adapters remain separate future decisions.
