## Why

The current runtime names a Harness-neutral Driver boundary but still assumes a local Claude child process at the decisive seams: spawn defaults to Claude, terminal results require an exit status and process identity, and interruption can synthesize a terminal state after signalling a PID. A second Harness backed by a persistent HTTP service or SDK subprocess would either inherit false lifecycle claims or force Harness-specific branches into the supervisor.

This change establishes the common control plane after `rename-to-codex-harnessdock` and before admitting OpenCode. It keeps Codex as the only scheduler and final acceptor while making each explicitly selected Harness/model route a durable, capability-qualified internal worker.

## What Changes

- **BREAKING (internal Driver contract):** replace Driver Contract v1 with v2. A Driver prepares one explicit route and returns a process-local live turn handle plus distinct secret-free durable native-session and native-turn references; normalized terminal evidence no longer requires a universal exit code or child-process receipt.
- Persist a launch claim, attempt, immutable input digest, route/capability snapshot, and leased authority before native submission. Distinguish local request preparation, possible native acceptance, proven native acceptance, effect, and terminal settlement; an ambiguous submission becomes `acceptance=unknown` and is never replayed automatically.
- Separate three facts that the current process-shaped lifecycle conflates: the durable control command, the live worker-local controller that can use the native connection, and the Driver-validated durable native-turn reference used only for restart reconciliation.
- Make interruption asynchronous and evidence-based. Request acceptance, request settlement, and native turn state are persisted separately; a deadline produces `unknown`, never a fabricated `interrupted` result, and the supervisor does not automatically escalate a rejected graceful request into destructive cancellation.
- Introduce a version-3 Agent shape with immutable explicit Harness, model, topology, and behavioral authority plus the accepted instance/Driver/capability snapshot. This internal change can read, validate, and exercise v3 fixtures, but the current HarnessDock seven-operation generation continues writing v2 Claude Agents until the dependent public-generation change supplies every required route argument. Existing v1/v2 Claude Agents remain readable and controllable through a Claude legacy adapter without cross-Harness conversion.
- Add deterministic, static, checkout-owned Harness instance admission and route validation. Readiness and capability maturity are instance/route facts; one unavailable instance does not disable unrelated admitted instances.
- Add a workspace-scoped behavioral writer lease in addition to native-session and Harness-instance leases. Unknown native settlement retains every affected lease and fails closed instead of admitting a possibly competing turn.
- Move remaining Claude-only authentication, history, model migration, session binding, and process-control behavior behind the Claude Driver/legacy adapter while preserving `runtime/index.mjs` as the sole public lifecycle interface.
- Keep the control plane policy-thin: it validates an explicit route and enforces lifecycle invariants, but does not choose a Harness/model, automatically fan out, retry through another route, reconcile worker opinions, or decide what work Codex should delegate. Driver prompt envelopes are limited to authority, topology, task text, and the requested return contract; Drivers do not decompose, synthesize, or route work.
- Keep usage/cost evidence route-qualified by Harness, instance, model, Driver/capability version, Agent, turn, and attempt so identical model strings on different Harnesses never merge.

Explicit non-goals:

- No OpenCode, DeepSeek Harness, Grok Build, Pi, or Codex Driver in this change. Codex remains the external originator/acceptor, not another worker route.
- No public MCP tool or input-schema change, Driver plugin loading, dynamic routing policy, automatic fallback, cross-Harness messaging, Agent route migration, worktree creation, implementation worker, install, login, daemon management, release, or Plugin refresh.
- No claim that `write: false` is an OS sandbox. Behavioral authority remains honestly labelled and is strengthened only by observed mutation evidence.
- No broad file relocation. The implementation introduces narrow seams first and keeps current module locations until at least a second Driver proves a stable decomposition.

Lifecycle ordering: `rename-to-codex-harnessdock` must be implemented and accepted first. This change must then be implemented and accepted before `add-opencode-explorer-driver`. Before implementation, re-run `openspec list` and rebase every copied MODIFIED/RENAMED requirement and overlapping file plan against any accepted/archived `add-targeted-barrier-agent-join`, `expose-actionable-agent-blocking`, `improve-agent-card-and-usage-receipts`, `replace-wait-polling-with-event-wakeup`, and `harden-native-background-task-completion` result. The last change remains the owner of stronger Claude terminal settlement: until it proves a stronger fact, the Claude adapter maps ambiguous native owned work to `unknown` and retains leases rather than claiming completion.

## Capabilities

### New Capabilities

- `workspace-turn-authority`: define the canonical-workspace behavioral writer lease, release evidence, and fail-closed unknown-settlement behavior shared by all Drivers.

### Modified Capabilities

- `harness-driver-runtime`: replace the process-shaped Driver contract with explicit instance admission, immutable route snapshots, live turn handles, separate durable native-session/native-turn references, optional capability-gated operations, and Harness-neutral terminal evidence.
- `agent-thread-registry`: introduce version-3 Agent identity with immutable Harness/model/topology/authority and preserve v1/v2 Claude records through an evidence-preserving legacy projection.
- `tracked-job-control`: represent control commands, request acknowledgement, native settlement, and lost-worker reconciliation without automatic forced-cancel escalation or synthesized terminal state.
- `durable-runtime-state`: persist version-3 launch/attempt/turn/control evidence, Harness-instance and writer leases, typed native-session/native-turn references, and conservative reconciliation across worker loss or Driver upgrades.
- `completion-delivery`: publish completion only after native turn and execution-world settlement are proven; retain unknown turns as active/blocked control-plane facts rather than emit false terminal events.
- `canonical-agent-orchestration`: make every logical Agent an explicitly routed internal worker and remove Harness/model selection, delegation thresholds, conflict policy, and automatic fallback from Plugin-owned orchestration guidance.
- `local-runtime-boundary`: generalize fixed host dependency and environment ownership from Claude-only assumptions to static checkout-owned Drivers without allowing model-facing executable, server, credential, or configuration selectors.
- `runtime-residency`: define terminal cleanup and nonresidency against Driver settlement evidence rather than universal Claude child exit.

## Impact

The primary implementation seams are `runtime/harness-contract.mjs`, `runtime/harness-capabilities.mjs`, `runtime/harness-registry.mjs`, `runtime/internal-runtime.mjs`, `runtime/job-supervisor.mjs`, `runtime/job-store.mjs`, `runtime/agent-store.mjs`, `runtime/agent-runtime.mjs`, `runtime/index.mjs`, and the Claude Driver/adapter modules. Focused contract, migration, control, lease, reconciliation, completion, CLI, and fake-Claude integration tests change. No external runtime dependency is added and the renamed HarnessDock seven-operation MCP generation remains unchanged in this change.
