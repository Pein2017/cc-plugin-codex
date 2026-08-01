## Context

`cc-for-pein` has already validated a useful durable-Agent control plane: a Codex
root owns stable Agent identities, ordered mailboxes, one active turn per Agent,
bounded jobs and completions, verified process control, exact-session continuation,
and nonresident history. The implementation currently names Claude Code throughout
that control plane because Claude Code is its only Harness. That coupling is becoming
the architectural limit rather than an intentional product boundary.

The approved north star is `pein-agents`: Codex remains the only intelligent lead,
while one deterministic local supervisor executes explicit routes through in-tree
Harness Drivers. A Harness is an agent runtime such as Claude Code or Codex Exec; a
model is a route offered by that Harness. Drivers may have different session,
steering, history, interruption, recovery, authority, and native-orchestration
capabilities. The supervisor must not flatten those differences into promises a
Harness cannot prove.

This change establishes that architecture without adding a second Harness. It must
preserve every observable Claude behavior and the current seven-operation public
API. It also depends on the fixed `bound-model-facing-agent-wait` contract: joining
is completion-first, an explicit progress observation returns at most one useful
non-hook update per caller turn, and quiet timeouts do not invite tight polling.

The checkout remains the sole source and runtime owner. Host Harness CLIs and their
native configuration/session stores are external execution dependencies, not source
dependencies. The runtime is Linux-only for release acceptance, and no change may
load implementation from a versioned Plugin Cache or an upstream repository.

## Goals / Non-Goals

**Goals:**

- Define one Harness-neutral supervisor that owns deterministic Agent lifecycle and
  delegates one complete Harness turn at a time.
- Preserve the existing Claude Code behavior by extracting it behind the first
  `claude-code` Driver rather than rewriting its protocol.
- Make Harness identity, immutable model/topology route, capability evidence, native session
  identity, and lease ownership explicit in versioned durable state.
- Keep routing, decomposition, fallback, and final acceptance with the Codex lead and
  its `agent-routing` policy.
- Fail closed when a requested lifecycle operation is not supported by the selected
  Driver's declared capabilities.
- Create a staged seam that can admit a Codex Exec Driver in a later OpenSpec without
  weakening current Claude guarantees.

**Non-Goals:**

- Implementing Codex Exec, Luna, Grok, Kimi, raw provider APIs, or any second Harness.
- Renaming the Plugin, changing its public MCP tools, or exposing a public `harness`
  selector in this change.
- Building a second planning/router Agent inside the supervisor, automatic model
  selection, quota fallback, voting, or a universal provider abstraction.
- Normalizing token-level streams, tool-call schemas, native subagent trees, or
  provider-specific configuration below the complete-turn boundary.
- Changing Claude model policy, Fable topology, terminal-parity permissions, native
  hooks/MCP/skills, completion content, or exact-session behavior.
- Releasing, installing, refreshing Plugin discovery, or mutating versioned Cache.

## Decisions

### 1. Harness, route, and Agent are separate concepts

The durable vocabulary is:

- **Harness**: the executable agent runtime and its native configuration/session
  environment, identified by a stable `harnessId` such as `claude-code`.
- **Route**: an immutable Harness-owned model and topology selection for an Agent.
- **Turn parameters**: explicit effort and write intent selected by the lead for one
  activation; a follow-up may change them without changing the Agent route.
- **Agent**: the supervisor-owned durable logical identity, mailbox, lifecycle, and
  continuation history.
- **Turn**: one bounded activation of an Agent through its fixed Harness route.

The model-facing lead chooses the route explicitly. The supervisor validates and
records it but never infers a route from a task or changes it after Agent creation.
It validates effort and write intent on every turn and records them on that job,
rather than representing the first turn's effort as immutable Agent identity.

**Alternative considered:** Treat each model as a Harness. Rejected because model
labels do not own authentication, session storage, tools, transport, or recovery;
those are Harness semantics.

### 2. One deterministic supervisor owns lifecycle; Codex owns intelligence

The supervisor continues to own root scoping, Agent registry, mailbox ordering,
single-active-turn arbitration, job receipts, completion inbox, wait/progress budget,
process identity, leases, retention, and reconciliation. It contains no task planner,
model router, automatic retry across models/Harnesses, or synthesis policy.

The Codex lead owns task decomposition, Harness/model/effort choice, whether to wait
or work in parallel, follow-up content, cross-Agent synthesis, and acceptance. The
supervisor may report structured capability or recovery facts, but it cannot turn
those facts into a new route.

**Alternative considered:** Add a model-powered router inside the Plugin. Rejected
because it creates competing orchestration authority, obscures cost decisions, and
makes lifecycle recovery nondeterministic.

### 3. The Driver boundary is one complete turn

The internal contract is coarse-grained and asynchronous. A Driver implementation
provides stable identity and capability metadata, validates and revalidates prepared
preflight evidence, explains an unready preflight in Harness-owned terms, validates a prepared route, starts
one complete turn, accepts supervisor-assigned input when supported, interrupts the
owned process when supported, and optionally reads bounded native assistant history.
The turn returns one normalized terminal result with:

- native session reference and exactness evidence;
- terminal status and structured failure classification;
- bounded progress and tool/activity receipts required by the supervisor;
- process acceptance/identity evidence;
- continuation and interruption evidence; and
- final outer-assistant message or an explicit absence reason.

The Driver owns executable discovery, authentication/configuration, command-line
construction, native system-envelope integration, protocol parsing, native tool and
subagent behavior, in-turn transport recovery, native session history, version
compatibility, and Harness-specific failure detection. These details do not enter the
generic supervisor schema except as bounded opaque receipts or normalized evidence.

**Alternative considered:** Normalize every stream event and tool call into a shared
provider protocol. Rejected because it would make Claude stream-json the accidental
universal contract and impose false parity on future Harnesses.

**Alternative considered:** Keep separate supervisors behind a common facade.
Rejected because it duplicates ownership, mailbox, wait, retention, and reconciliation
semantics and prevents one coherent Agent topology.

### 4. Capabilities are explicit evidence, not optimistic booleans

Each Driver version publishes a capability snapshot using closed vocabularies:

- `activeInput`: `acknowledged_active_stream` or `initial_only`;
- `continuation`: `exact_resume` or `fresh_only`;
- `history`: `assistant_messages` or `unavailable`;
- `interrupt`: `graceful_flush_proven`, `best_effort_signal`, or `unsupported`;
- `automaticRecovery`: `exact_session_transport` or `none`;
- `authorityEnforcement`: `process_sandbox` or `prompt_only`;
- `leafEnforcement`: `effective_tool_denial` or `prompt_only`;
- `nativeOrchestration`: `opaque_bounded` or `disabled`.

The supervisor persists the accepted snapshot on every Agent/job so recovery is
judged against the same contract that launched the turn. Unknown values, a missing
required capability, or an incompatible Driver version fail before process launch.
Capabilities describe observable behavior only; they do not advertise model quality.

**Alternative considered:** A small set of `supportsX` booleans. Rejected because a
boolean cannot distinguish exact resume from fresh continuation, graceful interrupt
from a signal, or enforced policy from prompt guidance.

### 5. Claude Code is the only admitted Driver in this change

The Driver registry is static, checkout-owned, and initially contains only
`claude-code`. The extraction composes the current Claude modules; it does not fork a
new Claude runtime or translate its protocol into a more generic internal stream.
All current model admission, effort, delegation envelope, Fable one-generation
orchestration, Workflow/Agent denials, fixed environment, terminal parity, live input,
exact resume, history, compatibility, and usage-limit behavior remain authoritative.

No caller can provide a Driver module, executable, settings path, environment file,
or capability override. Adding a Driver requires a later OpenSpec, in-tree code,
contract fixtures, compatibility checks, and a public-generation decision.

**Alternative considered:** Implement the Codex Driver together with the abstraction.
Rejected because parity cannot be distinguished from abstraction regressions when the
first extraction and first new implementation land together.

### 6. Durable state advances to explicit version 2

Version-2 Agent records add immutable `harnessId`, immutable model/topology `route`,
`driverVersion`, `capabilities`, and a neutral `nativeSessionRef`. Version-2 jobs copy
those launch-critical fields, add the explicit per-turn effort/write parameters, and
retain a Harness-owned opaque receipt namespace.
Session bindings and active leases are keyed by canonical `(harnessId, instanceKey,
nativeSessionId)` and remain separately bound to one root and Agent.

`instanceKey` is produced by the Driver from the minimum stable native configuration
identity required to prevent conflicting ownership. For Claude Code it is the
canonical `CLAUDE_CONFIG_DIR`; a future Driver must specify its own canonical key.
Opaque Driver receipts are bounded, versioned, and never used as the sole generic
proof for signalling, ownership, or continuation.

Version-1 Agent/job/session records are interpreted as `claude-code` with their
current Claude route and session semantics. A terminal, unowned v1 record may be
normalized to v2 on its next safe write. An active or ownership-uncertain v1 record is
never rewritten by a v2 process; its existing worker remains the lifecycle owner until
terminal reconciliation. The implementation does not maintain indefinite v1/v2
dual-write paths.

**Alternative considered:** Rename Claude fields in place without a schema bump.
Rejected because old and new runtimes could assign different meanings to the same
record during a hot checkout update.

### 7. Public API stability is deliberate and temporary

This change preserves the seven current public operations and their schemas. Since
the only admitted Driver is Claude Code, spawn continues to imply `claude-code`. The
internal state is nevertheless explicit; no v2 record infers its Harness from a model
name.

A later Codex Driver change must expose an explicit Harness/route choice, bump the
public MCP generation, refresh discovery, and require a new Codex task. It must not
overload model aliases to choose a Harness or silently route unsupported behavior.

**Alternative considered:** Add optional `harness` now with a one-value enum.
Rejected because it creates public compatibility work before a second implementation
can validate the interface.

### 8. The existing bounded-wait change is a prerequisite

`bound-model-facing-agent-wait` must be completed and synchronized into the owning
specifications before implementation starts. Its completion-first join, explicit
one-progress observation, progress revision cursor, and hook-only suppression become
generic supervisor behavior. Drivers report progress evidence; they do not own polling
cadence or model-facing delivery budgets.

This dependency prevents the Harness refactor from preserving the current excessive
wait-call workflow as an accidental multi-Harness invariant.

## Risks / Trade-offs

- **[Abstraction still mirrors Claude accidentally]** → Admit only behavior required
  by the shared lifecycle, keep native receipts opaque, and require the second Driver
  to validate or revise the seam in a separate OpenSpec.
- **[Hot update crosses v1/v2 ownership]** → Never rewrite active or uncertain v1
  records, persist schema/Driver evidence on jobs, and make incompatible old/new
  ownership fail closed rather than steal a process or session.
- **[Capability snapshot becomes stale after a CLI update]** → Bind it to Driver and
  runtime-reported Harness versions, rerun readiness/compatibility before each new
  turn, and preserve the prior snapshot for recovery decisions.
- **[Generic receipts lose useful Claude evidence]** → Keep bounded versioned
  Driver-owned receipts alongside the normalized terminal result and preserve all
  existing Claude contract tests as parity tests.
- **[Prompt-only boundaries are mistaken for security]** → Report enforcement level
  explicitly; route and write intent remain behavioral authority unless a Driver can
  prove process-level enforcement.
- **[One supervisor becomes a large abstraction layer]** → Keep the Driver interface
  turn-level, retain one lifecycle owner, and reject provider-level normalization or
  optional hooks without a demonstrated second consumer.
- **[Public API temporarily hides the internal Harness]** → Limit the registry to
  Claude Code and require an explicit public-generation change before adding a second
  Driver.

## Migration Plan

1. Complete, verify, synchronize, and archive `bound-model-facing-agent-wait`; make no
   Harness work depend on an unsynchronized delta specification.
2. Add contract fixtures for the Harness-neutral lifecycle and freeze the complete
   current Claude behavior as parity evidence before moving modules.
3. Introduce the internal Driver contract and static registry with only
   `claude-code`; compose the existing Claude implementation behind it without a
   durable-schema or public-API change.
4. Run all focused Claude runtime, MCP, recovery, history, environment, prompt, and
   wait tests. Stop if any observable behavior changes rather than adapting tests to
   the abstraction.
5. Introduce v2 Agent/job/session-binding/lease schemas, v1 interpretation, and
   explicit migration/reconciliation tests. Refuse active v1 takeover.
6. Switch new Agent creation to v2 only after mixed-state tests prove terminal v1
   continuation, active v1 isolation, crash recovery, retention, and completion
   idempotence.
7. Run `openspec validate --strict`, focused tests, and `npm run check`. This change is
   accepted at source level only; release, install, Cache refresh, rename, and public
   generation remain separate decisions.

Rollback before step 6 removes the internal Driver composition and keeps v1 state
unchanged. After v2 creation is enabled, rollback means restoring the last v2-aware
runtime. Version-2 jobs use a queue state that a v1 detached worker cannot claim;
v2 Agents are rejected by the v1 registry. Claude binding and lease records remain
wire-readable by v1 intentionally so an older process observes existing ownership
instead of treating the native session as unowned.

## Open Questions

There are no blocking questions for this architecture-only extraction. The following
decisions are intentionally deferred until a concrete Codex Exec Driver proposal can
answer them with evidence:

- Which Codex Exec capabilities are proven for continuation, history, active input,
  interruption, and process-level authority?
- Does the first multi-Harness public generation select a Harness directly, select a
  named lead-owned route, or expose both while keeping model/effort explicit?
- At what adoption point should Plugin and state display names change from
  `cc-for-pein` to `pein-agents` without breaking active task discovery shells?
