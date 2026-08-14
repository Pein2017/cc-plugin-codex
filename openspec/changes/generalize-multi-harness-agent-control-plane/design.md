## Context

See `proposal.md` for motivation and `specs/` for behavior. The current checkout already has useful neutral pieces: a static Driver registry, immutable Harness/model/topology facts on v2 Agents, durable mailboxes and detached jobs, exact-session leases, at-least-once completion, bounded progress, and a single public lifecycle owner in `runtime/index.mjs`.

Serena inspection of the fixed tree identifies four remaining structural couplings:

1. `AgentRuntime.spawnAgent()` resolves `DEFAULT_HARNESS_ID`, so the public layer cannot pass a caller-selected admitted route.
2. `validateHarnessTurnResult()` universally requires an integer `exitStatus` and child-process acceptance evidence.
3. `ClaudeRuntime.interrupt()` invokes PID-based Driver methods from a separate runtime call, automatically escalates a failed graceful request to `cancelTurn`, and writes `interrupted` after a five-second observation loop even when no Driver terminal result arrived.
4. `runtime/index.mjs` exports `createClaudeRuntime()` and the internal supervisor class and store paths still carry Claude names and Claude-only migration logic.

The detached worker is nevertheless the right lifecycle owner: after handoff it owns the native transport while other MCP calls remain short-lived. The design preserves that ownership and adds a durable command channel to it rather than attempting to serialize live HTTP streams, SDK objects, or stdio handles.

The renamed HarnessDock seven-tool generation cannot satisfy the newly chosen rule that Harness, model, topology, and behavioral authority are all required and never defaulted. Therefore this change installs and tests the internal version-3 shape but leaves current public spawns on version 2. The dependent `add-opencode-explorer-driver` change performs one public-generation bump, exposes all required inputs, adds `list_harnesses`, and begins v3 writes atomically. `rename-to-codex-harnessdock` is a hard prerequisite: implementation must not preserve the old product/MCP namespace while introducing the neutral core.

## Goals / Non-Goals

**Goals:**

- Define a process-neutral Driver Contract v2 whose lifecycle is precise enough for CLI, HTTP service, persistent SDK subprocess, and ACP-backed Harnesses.
- Preserve one durable root-scoped Agent/mailbox/completion model while keeping native transcripts, tools, sessions, and transport protocols Driver-owned.
- Make interruption and worker-loss recovery honest: request acknowledgement is not terminal settlement.
- Freeze a version-3 Agent route and workspace authority once, then reuse it for every turn.
- Keep legacy Claude Agents usable without allowing route migration or rewriting historical evidence.
- Establish a narrow module layout and test boundary that a second Driver can implement without broad repository relocation.

**Non-Goals:**

- No public schema change or second Driver here.
- No generalized workflow engine, route optimizer, delegation policy, opinion merger, or automatic fallback.
- No serializable live transport, generic RPC bus, Driver-specific state database, or dynamic Driver package loader.
- No OS sandbox claim, worktree creation, repository merge, installation, authentication, service lifecycle, or remote network exposure.
- No attempt to normalize native tool calls, subagents, transcript formats, prompt caching, or provider billing beyond bounded terminal metrics.

## Decisions

### 1. Keep one Supervisor and make Driver v2 intentionally breaking

The shared Supervisor continues to own only:

- trusted Codex root and canonical workspace scope;
- Agent identity and immutable route;
- ordered mailbox assignment and acknowledgement;
- detached job ownership and wakeups;
- durable control commands;
- instance, session, and writer leases;
- normalized progress, blocking, metrics, terminal projection, and completion delivery;
- retention and conservative reconciliation.

The Driver owns everything native: discovery, fixed instance configuration, auth/readiness, route validation, prompt envelope, transport, parsing, native tools/subagents, native recovery, history, interruption request, observation, terminal classification, and native reference schema.

Driver Contract v1 is not kept as an additive subset. Its universal `exitStatus`, `{spawnAccepted, identityProven}`, PID interrupt, and blocking `startTurn()` result encode one Harness. Contract v2 changes the turn boundary and is accepted only when `contractVersion === 2`.

Alternative considered: keep v1 and add nullable HTTP fields. Rejected because every future Driver would have to fabricate process facts or the Supervisor would branch on Harness type.

Alternative considered: put OpenCode directly into `AgentRuntime`. Rejected because it would duplicate mailbox, completion, recovery, and root-isolation logic and make a third Driver more expensive.

### 2. Use a static Driver registry with logical instance inspection

Drivers remain in-tree and statically imported. No manifest, environment value, model-facing path, or persisted record can name a JavaScript module.

The conceptual Driver surface is:

```js
/** @typedef {{
 *   harnessId: string,
 *   driverVersion: string,
 *   contractVersion: 2,
 *   describe(): DriverDescription,
 *   inspectInstances(scope: DriverScope): Promise<InstanceInspection[]>,
 *   validateRoute(request: RouteRequest, inspection: InstanceInspection): CanonicalRoute,
 *   prepareTurn(input: PreparedTurnInput): PreparedTurn,
 *   revalidatePreparedTurn(turn: PreparedTurn, scope: DriverScope): LaunchContext,
 *   validateNativeSessionRef(ref: NativeSessionRef): NativeSessionRef,
 *   validateNativeTurnRef(ref: NativeTurnRef): NativeTurnRef,
 *   startTurn(input: StartTurnInput): Promise<LiveHarnessTurn>,
 *   observeTurn?: (ref: NativeTurnRef, scope: DriverScope) => Promise<TurnObservation>,
 *   readAssistantHistory?: (agent: AgentRecord, page: HistoryPage) => HistoryResult
 * }} HarnessDriverV2 */
```

`describe()` is pure static metadata. `inspectInstances()` is side-effect-free with respect to model execution and Plugin lifecycle: it may inspect a fixed executable, endpoint, auth metadata, or service health but cannot install, login, start, stop, or repair anything. It returns all statically configured logical instances, including unavailable ones.

`DriverScope` is a least-authority value, not a service locator. It contains only canonical workspace/root/Agent/turn/attempt identity, the immutable route snapshot, bounded assigned input, deadlines/signals, and the selected Driver's admitted fixed environment values. It exposes no registry/store writer, MCP operation, other Driver, arbitrary environment, credential bag, route selector, or foreign native reference.

An instance inspection includes:

```js
{
  harnessId,
  instanceKey,          // stable, redacted, Driver-derived
  readiness: "ready" | "unavailable" | "blocked" | "unknown",
  liveValidated: boolean,
  maturity: "experimental" | "validated",
  detailCode,           // closed, sanitized
  routes                // bounded safely discoverable route facts or null
}
```

`validateRoute()` never fills a missing caller choice. It returns a canonical route or rejects. The first public multi-Harness generation exposes no instance selector; if a Driver reports more than one eligible instance, validation returns an actionable ambiguity error. A later named-profile change can add an explicit selector without changing the Driver lifecycle.

Alternative considered: one Harness equals one global process. Rejected because future users may have local/cloud or account-separated logical instances, and one instance outage must not block unrelated ones.

### 3. Freeze a route-qualified capability snapshot

Capabilities belong to the accepted `(harnessId, instanceKey, canonical route, driverVersion)` tuple, not the Driver module in the abstract. A route snapshot is persisted on every prepared job and version-3 Agent.

The closed v2 dimensions are:

| Dimension | Initial values | Meaning |
| --- | --- | --- |
| `interaction` | `noninteractive_fixed_policy`, `requires_broker` | Whether the route can run without an approval/question broker |
| `activeInput` | `acknowledged_active_stream`, `initial_only` | Whether the live turn can acknowledge post-start input |
| `continuation` | `exact_resume`, `fresh_only`, `none` | Transcript/session continuation only |
| `history` | `assistant_messages`, `unavailable` | Bounded retrospective outer-assistant history |
| `interruptRequest` | `supported`, `unsupported` | Whether a live handle can request interruption |
| `turnObservation` | `terminal_observable`, `unavailable` | Whether another process can reconcile by durable reference |
| `automaticRecovery` | `exact_session_transport`, `none` | Whether bounded replay/reconnect is Driver-proven safe |
| `authorityEnforcement` | `prompt_only`, `harness_policy`, `process_sandbox` | Actual enforcement strength, never inferred |
| `leafEnforcement` | `effective_tool_denial`, `prompt_only`, `unsupported` | Native delegation boundary strength |
| `nativeOrchestration` | `opaque_bounded`, `disabled` | Same-Harness native team capability |

Maturity is orthogonal: Driver and individual capabilities carry `experimental` or `validated`. An experimental history capability can be disabled without disabling an otherwise validated turn route.

The Supervisor branches only on these closed values and method presence. It never branches on `harnessId` to decide behavior.

Phase A/B admit only `noninteractive_fixed_policy`. `requires_broker` is discoverable but unavailable; approval brokerage is a later cross-Harness capability, not a generic TUI automation shim.

### 4. Return a process-local LiveHarnessTurn instead of a terminal result

Before `startTurn()`, the supervisor durably writes a `launchClaim` and `attempt` binding the root, Agent, job, immutable route/capability snapshot, authority leases, assigned mailbox identity, and bounded input digest. `startTurn()` returns only after the Driver has a native turn that can be durably identified. The returned object is process-local and never serialized:

```js
/** @typedef {{
 *   nativeTurnRef: NativeTurnRef,
 *   nativeSessionRef?: NativeSessionRef,
 *   result: Promise<NormalizedTerminalResult>,
 *   deliverActiveInput?: (input: AssignedInput) => Promise<InputReceipt>,
 *   requestInterrupt?: (command: InterruptCommand) => Promise<InterruptRequestReceipt>,
 *   dispose: () => Promise<void>
 * }} LiveHarnessTurn */
```

The detached worker performs this order:

1. revalidate the prepared route and readiness;
2. acquire the Harness-instance lease and, for write authority, writer lease;
3. persist the launch claim/attempt and input digest as `not_submitted`;
4. call `startTurn()`;
5. validate and atomically persist `nativeTurnRef` plus any separate `nativeSessionRef` as proven native acceptance;
6. only then mark initial mailbox entries dispatched/acknowledged;
7. race `result` against durable mailbox/control wakeups;
8. call only capability-admitted live methods;
9. validate the normalized terminal result;
10. clear live ownership, release leases, publish terminal job and completion, then dispose.

If the call fails with proof that no request crossed the native transport boundary, the attempt remains not submitted/rejected. If the call may have crossed that boundary but the exact native-turn reference cannot be persisted, acceptance becomes unknown, leases remain held, and neither the same nor another Driver may replay the input automatically. This is the service-backed equivalent of the current “accept PID before writing prompt bytes” fence without treating a local exception as proof of remote non-acceptance.

Alternative considered: pass an async command iterator into one blocking `runTurn()`. It would work, but it makes the Driver own mailbox/control orchestration and weakens the separation between shared ordering and native delivery. A live handle keeps the core event loop shared and the native connection opaque.

### 5. Persist separate typed session and turn references, never the live connection

Both envelopes are core-owned:

```js
{
  version: 1,
  harnessId,
  driverVersion,
  instanceKey,
  locatorVersion,
  locator
}
```

`locator` is not arbitrary JSON. Each Driver exports a pure exact-schema validator for every locator version it supports. The core additionally enforces byte, depth, scalar, key-count, and forbidden-key bounds. Endpoints and credentials remain in the fixed Driver configuration. `NativeSessionRef` identifies only reusable continuation state; `NativeTurnRef` identifies the exact accepted attempt. One cannot substitute for the other. Examples include a verified Claude process/turn identity plus a separate Claude session identity, or an OpenCode session binding plus a distinct message/turn lineage.

No second Driver-owned durable store is introduced. If a future protocol requires restart recovery data that cannot be represented safely as an exact locator, its `turnObservation` capability remains unavailable and worker loss becomes unknown.

Alternative considered: store an opaque Driver blob. Rejected because it can hide credentials, become an unversioned state store, and cannot resurrect live stdio or callback state anyway.

### 6. Treat control commands, request acknowledgement, and settlement separately

An interrupt is a durable command addressed to the active job:

```js
{
  commandId,
  kind: "interrupt",
  requestedAt,
  requestState: "none" | "accepted" | "rejected" | "unsupported",
  settlement: "pending" | "settled" | "unknown",
  nativeTurnState: "active" | "terminal" | "unknown",
  lastEvidenceAt,
  sanitizedReason
}
```

The isolated `interrupt_agent` call atomically appends the command and wakes the owning detached worker. It does not invoke the Driver directly. The worker calls `liveTurn.requestInterrupt()` and persists the request receipt. Only `liveTurn.result` or a valid later `observeTurn()` may establish terminal state.

The public operation can return:

- `no_active_turn` when a terminal/no-turn snapshot is proven;
- `interrupt_requested` when the command is accepted but settlement remains pending;
- `still_working` when rejected or not yet accepted;
- `unsupported` when the route does not admit interruption;
- `settlement_unknown` when ownership was lost and observation cannot decide;
- `interrupted` only when the native result proves interruption and settlement.

The exact public receipt change is deferred to the dependent MCP generation, but the internal state machine is fixed here.

There is no automatic `cancelTurn()`. Internal stale-owner cleanup remains possible only where exact process identity or Driver observation proves the target; its result is a separate recovery fact and cannot retroactively turn the user's interrupt into success.

Alternative considered: retain the existing five-second loop and call terminal when the signal succeeds. Rejected because successful HTTP 204, signal delivery, or queued SDK cancellation proves only request acceptance.

### 7. Separate native turn, execution world, and transcript continuity

The normalized result has independent axes:

```js
{
  status: "completed" | "failed" | "interrupted",
  nativeTurn: "terminal",
  executionWorld: {
    continuity: "preserved" | "lost" | "not_applicable" | "unknown",
    settlement: "settled" | "active" | "unknown"
  },
  continuation: {
    mode: "exact_resume" | "fresh_only" | "none" | "unknown",
    nativeSessionRef: NativeSessionRef | null,
    evidence: BoundedEvidence
  },
  failure,
  finalMessage,
  finalMessageAbsenceReason,
  progress,
  metrics,
  driverReceipt
}
```

`executionWorld.settlement` means turn-owned work, not runtime existence. A persistent OpenCode server or DeepSeek shell can be preserved and settled simultaneously. A transcript may be exactly resumable after a shell reset; a shell may persist while the transcript cannot resume. The completion and recovery layers never collapse these facts into one `resumable` boolean.

The active `harden-native-background-task-completion` change remains the owner of stronger Claude-native owned-work evidence. Before it lands, the Claude adapter may report settled only under the currently proven process-close/terminal protocol boundary; any newly observed contradiction maps to unknown.

### 8. Introduce Agent/store version 3 behind a write gate

A version-3 Agent contains:

```js
{
  version: 3,
  agentId,
  path,
  ownerRootId,
  workspaceRoot,
  route: {
    harnessId,
    instanceKey,
    model,
    topology: "leaf" | "native_orchestrator",
    authority: "behavioral_read_only" | "behavioral_write",
    driverVersion,
    capabilities
  },
  lifecycle,
  continuation,
  nativeSessionRef,
  activeJobId,
  latestJobId,
  mailbox,
  timestamps,
  latestCompletionSequence
}
```

Reasoning effort stays turn-scoped because it does not change Agent identity or authority and some Harnesses may admit it per prompt. Each Driver owns a discriminated exact model/effort validator; the generic core does not share Claude enums or infer effort support from another Harness. Follow-up can supply effort only when the frozen route admits it and cannot supply or alter route fields.

The current generation keeps writing v2. A write gate keyed to the public API generation permits v3 creation only after all four required inputs exist. This avoids silently defaulting a route in the transitional release.

Legacy projection rules:

- v1/v2 imply `harnessId=claude-code` only because that meaning was fixed when written;
- existing selected model evidence is preserved; no model is inferred from names;
- `leaf` remains `leaf`; `claude_orchestrator` projects as `native_orchestrator` for validation;
- historical per-turn write intent remains historical and is not rewritten into immutable v3 authority;
- legacy follow-up uses its existing compatibility contract and cannot be converted to v3 or another Harness;
- no read causes a durable rewrite unless an existing legacy spec already admits that exact normalization.

Alternative considered: migrate every legacy record to v3 at startup. Rejected because historical mutable authority cannot be truthfully frozen, active ownership may exist, and old runtimes would not understand the new queue.

### 9. Add Harness-instance, native-session, and workspace-writer leases

Three separate lease keys cover separate conflicts:

| Lease | Key | Admission purpose |
| --- | --- | --- |
| Instance | `(harnessId, instanceKey)` plus Driver capacity class | Enforce configured per-instance active-turn capacity |
| Native session | `(harnessId, instanceKey, nativeSessionId)` | Prevent concurrent exact-session continuation |
| Writer | canonical workspace root | Prevent concurrent behavioral writers across Harnesses |

The first OpenCode Driver will declare capacity one. Claude retains evidence-driven concurrency. Capacity is part of the instance route snapshot, not a global `max_concurrency` constant.

Writer leases bind owner root, Agent, job, route, and canonical workspace. Read-only workers can coexist with a writer because behavioral read-only is not filesystem locking; acceptance witnesses separately measure mutation. Two writers never coexist in one canonical worktree. The Plugin does not create worktrees, so a future implementer route must start in an operator-prepared distinct root.

All leases release only after native terminal and execution settlement. Unknown retains leases. A first-generation operator diagnostic may report the exact blocked lease and evidence, but no model-facing or operator force-clear command is added here. Recovery must prove terminal/absence before release.

Alternative considered: release on worker exit. Rejected because a service or SDK-native turn may outlive the detached worker.

### 10. Keep mailbox semantics uniform but capability-gate active delivery

The Agent mailbox remains the durable ordering owner. `send_message` always appends without activating a terminal Agent. `followup_task` always makes the message available to an active turn or activates a new valid continuation.

For `activeInput=acknowledged_active_stream`, the detached worker calls `deliverActiveInput()` and marks the entry acknowledged only from a positive Driver receipt. For `initial_only`, messages remain queued for the next turn; the public receipt cannot say `dispatched_active`.

There is no Plugin auto-Agent messaging. Claude native team communication remains an opaque capability inside one Claude parent. Same-Harness Agent-to-Agent and cross-Harness Agent-to-Agent messaging are reserved. Cross-Harness workflow uses a new Agent plus Codex-authored distilled input.

### 11. Move Claude-only compatibility behind a legacy adapter without broad relocation

This change creates focused seams but avoids a repository-wide rename/move:

| File | Responsibility after this change |
| --- | --- |
| `runtime/harness-contract.mjs` | Driver v2 types/validators, LiveTurn and terminal invariants |
| `runtime/harness-capabilities.mjs` | Closed route capability snapshots and maturity |
| `runtime/harness-registry.mjs` | Static factories, descriptions, instance inspection; `DEFAULT_HARNESS_ID` exists only inside the legacy Claude adapter |
| `runtime/native-reference.mjs` | Separate session/turn envelopes, bounds, Driver locator validation |
| `runtime/turn-control.mjs` | Durable commands, acknowledgements, settlement state, wake integration |
| `runtime/turn-settlement.mjs` | Native/execution/continuation validation and terminal predicate |
| `runtime/workspace-writer-lease.mjs` | Canonical writer admission and conservative release |
| `runtime/claude-legacy-adapter.mjs` | v1/v2 Agent projection, Claude model/history/auth/session/process compatibility |
| `runtime/claude-code-driver.mjs` | Driver v2 and process-local LiveTurn façade |
| `runtime/internal-runtime.mjs` | Shared detached worker and live turn event loop; class may be renamed later |
| `runtime/agent-runtime.mjs` | Root-scoped Agent operations and version-gated route creation |
| `runtime/index.mjs` | sole public factory; add neutral name while retaining bounded compatibility alias |

`createAgentRuntime()` becomes the neutral public factory. `createClaudeRuntime()` may remain a temporary source-compatible alias returning the same current-generation surface, but new internal code and the dependent generation use the neutral name. `createInternalClaudeRuntime()` and class `ClaudeRuntime` can be renamed only where tests prove a mechanical change; file relocation is explicitly deferred.

Claude-only model migration, OAuth generation, transcript filesystem layout, `CLAUDE_CONFIG_DIR`, and PID signalling must no longer appear in generic Agent paths. The legacy adapter owns their translation to neutral facts.

Alternative considered: immediately move every module into `runtime/drivers/claude-code/` and `runtime/supervisor/`. Rejected because it creates a review-hostile rename diff before a second implementation proves the seam.

### 12. Make failure scope instance-qualified and fallback lead-owned

Existing closed blocking reasons remain, but Harness-scoped failures become logical-instance scoped internally. Auth, quota, service, and compatibility failures block only the exact `(harnessId, instanceKey)` unless the Driver produces evidence of a broader fixed configuration boundary. Unrelated Harnesses and instances remain available.

The public completion retains route lineage so Codex can decide whether to retry itself, create another Agent, or use another Harness. The Plugin never does so automatically. The same model ID under two Harnesses is two distinct routes and evidence lineages.

### 13. Keep security boundaries structural

The following values never enter prompts, public receipts, Driver locators, or general logs:

- passwords, API keys, OAuth tokens, refresh tokens, auth headers, cookies;
- full environment snapshots or unapproved environment values;
- arbitrary service URLs containing credentials;
- native transcript/tool payloads not selected into bounded evidence;
- foreign root or native session identifiers in model-facing errors.

Server endpoints, usernames, and auth material belong to fixed operator configuration resolved by the Driver. Instance keys are stable redacted identities, not hashes of secrets. Durable files retain owner-only atomic persistence on Linux.

Behavioral read-only is always labelled with its enforcement level. Acceptance records before/after mutation evidence but cannot elevate a prompt-only boundary to sandbox status.

### 14. Fit future Harnesses without changing core semantics

This change does not implement the later Drivers, but the contract is checked against their known transport shapes:

| Harness | Process-local LiveTurn | Durable reference | Restart observation | Expected differences |
| --- | --- | --- | --- | --- |
| Claude Code | spawned stream-json child | verified PID identity plus native session evidence | process/session evidence where proven | exact transcript resume, active stdin steering, native team capability |
| OpenCode | SDK client bound to operator server/session | instance key plus OpenCode session/turn identity | HTTP session/message/status/abort evidence | server persists independently, first Driver initial input only, one active turn |
| DeepSeek Harness | Driver-owned persistent SDK/JSON-RPC subprocess | runtime/session identity supported by pinned SDK | only if SDK exposes authoritative query/cancel | transcript and persistent PTY/execution continuity are separate; no assumed cancel |
| Grok Build | ACP stdio or headless CLI live session | ACP session identity or verified CLI process identity | only from proven ACP session load/update facts | stream-json/ACP mappings stay Driver-owned; cancel requires live proof |
| Pi | CLI/RPC turn owned by its Driver | only a pinned protocol's exact session/turn identities | unavailable unless the pinned protocol exposes authoritative lookup | reference only; no TUI automation or assumed parity |

If a later Harness cannot supply a secret-free durable identity or authoritative restart observation, it still fits with `turnObservation=unavailable`; worker loss honestly becomes unknown.

Codex is intentionally absent from this table as a Driver. It remains the product's initiating conversation, planner, router, synthesizer, final editor/reviewer, and acceptor. Adding a Codex worker route would be a separate product decision, not symmetry work.

### 15. Keep the Driver prompt envelope and result projection narrow

The generic runtime passes the caller's bounded task input unchanged with immutable authority/topology facts and a Driver-owned transport/return envelope. Drivers may translate those facts into native syntax and ask for one bounded outer-assistant result. They do not add task decomposition, research methodology, multi-worker conflict policy, or final synthesis.

The normalized completion stores `finalMessage` (or a closed absence reason), bounded progress/failure/metrics, and optional Driver-validated opaque result metadata. It does not require repository `scope/questions` inputs or a Plugin-owned research report ontology. Harness-native tools, subagents, transcript, and event history remain inside the Harness.

Usage receipts are keyed by root, Agent, turn, attempt, Harness, instance, full model, Driver/capability version, topology, and authority. Equal model labels across Harnesses stay distinct; missing provider telemetry stays unknown.

### 16. Test the architecture in contract, migration, and vertical slices

The implementation order follows risk:

1. pure v2 validators and fixtures;
2. typed native reference and settlement state machines;
3. command mailbox and live handle loop using a fake service Driver;
4. lease admission/release/unknown tests;
5. Claude Driver v2 façade and legacy Agent projection;
6. public-factory neutrality with unchanged renamed HarnessDock seven-tool schemas;
7. restart, worker-loss, interrupt, and completion integration;
8. full checkout verification.

A fake service Driver is required because fake Claude alone cannot prove the core stopped relying on PID/exit code. It must complete without a child process, accept an interrupt request without settling, lose its worker with/without observation, and preserve an operator-owned service after terminal completion.

The vertical slice passes only when:

- one legacy Claude Agent still follows up and interrupts under its accepted evidence;
- one fake service Agent completes through the same Supervisor with no process fields;
- request acceptance never terminalizes a turn;
- unknown settlement holds instance/session/writer leases;
- settled terminal evidence releases exactly once and delivers completion at least once;
- the public MCP tool names and input schemas remain byte/structure compatible for this change;
- `npm run check` and strict OpenSpec validation pass.

No real Claude call is required merely to prove the neutral core. Any real Claude regression witness requires separate existing test authorization and stops on account/auth/quota evidence.

## Risks / Trade-offs

- [The v2 contract refactor regresses mature Claude behavior] → Implement a Claude LiveTurn façade behind captured fixtures, keep legacy projection explicit, and require parity tests before switching the supervisor.
- [A live Driver method blocks the worker command loop] → Require promise-based methods with Driver-owned deadlines and AbortSignal support; command settlement remains durable even if disposal fails.
- [Unknown settlement permanently holds a lease] → This is the deliberate fail-closed trade. Operator diagnostics expose the exact route/reference version and next evidence needed; force-clear is a later explicit design.
- [Instance inspection accidentally performs model work or service mutation] → Contract tests inject forbidden side effects and require side-effect-free inspection; live provider validation is separately labelled.
- [Capability vocabulary becomes too broad before later Drivers] → Admit only dimensions that change shared lifecycle behavior. Native protocol details stay in bounded Driver receipts.
- [Version-3 write gating complicates the transition] → Keep one explicit generation predicate and fixtures proving current MCP calls write v2 while dependent-generation calls require all v3 route fields.
- [Legacy mutable write intent conflicts with immutable authority] → Do not migrate legacy identity. Preserve old behavior only through the legacy adapter and require new v3 Agent identity for immutable authority.
- [Persistent execution worlds are confused with outstanding work] → Store continuity and settlement independently and test the idle-persistent-session case.
- [The active Claude background-task change races this refactor] → Coordinate only through the normalized settlement field. Do not absorb or close its evidence tasks; unknown remains safe.
- [Broad neutral names create churn without value] → Add narrow new modules and aliases first; defer directory and bulk symbol moves until another stable Driver exists.

## Migration Plan

1. Begin only from an accepted `rename-to-codex-harnessdock` tree, then add Driver v2, capability v2, native-reference, launch-claim, control, settlement, and writer-lease modules behind tests while production still uses Driver v1.
2. Add v3 record validators and fixtures plus the public-generation write gate. Keep current public spawns on v2.
3. Implement the fake service Driver test seam and switch the internal Supervisor to LiveTurn/control semantics.
4. Wrap Claude in Driver v2 and move its legacy migration/auth/history/process details behind `claude-legacy-adapter.mjs`.
5. Remove Supervisor terminal synthesis and automatic cancel escalation; introduce durable unknown settlement and lease retention.
6. Switch `runtime/index.mjs` internals to `createAgentRuntime()` while retaining the bounded `createClaudeRuntime()` alias for current callers.
7. Run focused migration/control/reconciliation/completion tests, the complete fake-Claude suite, `npm run check`, `openspec validate ... --strict`, `openspec validate --all --strict`, and `git diff --check`.
8. Leave the public MCP generation, Plugin discovery, installation, release, and v3 Agent creation disabled until `add-opencode-explorer-driver` is implemented and accepted.

Rollback before step 3 removes unused v2 modules. Rollback after the Supervisor switch must preserve readable v3 fixtures/control/lease records and must not run an older process against active v2-contract jobs. Stop all new activation, allow or reconcile accepted workers to terminal/unknown, then restore the prior runtime only when no version-3 or Driver-v2 job is active. No migration deletes legacy Agent, job, completion, or Claude artifacts.

## Open Questions

None for this change. Named multi-instance selection, operator force-clear, same-Harness Agent messaging, cross-Harness messaging, stronger read-only enforcement, and broad module relocation are explicitly deferred capabilities rather than unresolved implementation choices.
