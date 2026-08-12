## Context

See [proposal.md](proposal.md) for motivation and scope. The current runtime has
one durable CC Agent per Claude session, a two-value `delegation_mode`, and one
execution-profile owner for all Claude CLI overrides. `claude_orchestrator`
currently permits only Fable and adds a short one-generation prompt; it does
not activate Claude Native Agent Teams, inject named teammate definitions, or
retain observable native-surface evidence.

Claude Code 2.1.227 exposes `--agents`, experimental Native Agent Teams,
`Agent`, `SendMessage`, a shared task list, local teammate memory, and structured
init inventories. Official current behavior is important:

- Agent Teams require `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`; as of 2.1.178
  the first named teammate forms the team without `TeamCreate`, and the team
  config is cleaned when the process exits.
- In-process teammates are not restored by `/resume`; a resumed lead must form
  a fresh team. One Claude process/session has one team.
- Teammates inherit lead permissions and effort. Definition model pins are
  overridden by an Agent call-level model or `CLAUDE_CODE_SUBAGENT_MODEL`.
- `memory: local` uses `.claude/agent-memory-local/<agent-type>/` and may eagerly
  create/update it with ordinary file tools.
- The init tool inventory names the public `Agent` surface `Task`; init also
  carries loaded Agent definition names.
- Init tool names are not mode-discriminating: `Agent`, `SendMessage`, and task
  tools may exist even when the Agent Teams server gate is inactive. A first
  named Agent result with `status: teammate_spawned` is the structured
  transport proof.
- Agent Teams have no hard teammate-count limit. The ordinary-subagent
  concurrency env is inert on the native teammate path.
- Teammate idle/completion is delivered to the lead through the native mailbox.
  `TeammateIdle` and `TaskCompleted` are hook lifecycle events, but the exact CLI
  does not emit a stable top-level `system/teammate_*` stream event. Hooks are
  operator configuration and are not injected merely to make release evidence.

References: [Agent Teams](https://code.claude.com/docs/en/agent-teams),
[Subagents](https://code.claude.com/docs/en/sub-agents), and
[Tools](https://code.claude.com/docs/en/tools-reference).

Terminal parity always launches with `--dangerously-skip-permissions`, so role,
write-surface, recipient, isolation-input, and numeric budget rules are
behavioral contracts. Stable CLI tool denial, one-layer depth, Driver-version
admission, and structured-init rejection are stronger runtime boundaries.

The public ownership boundary remains `runtime/index.mjs`. The Plugin owns the
durable parent Agent, job, Claude session, recovery, and final completion only.
Claude owns the Native Agent Team, shared tasks, mailbox, teammate sessions,
local teammate memory, and teammate transcripts inside one process turn.

## Goals / Non-Goals

**Goals:**

- Compose one reproducible experimental Native Agent Team envelope for exact
  Opus or Fable leads without adding an eighth public operation or Plugin child
  state machine.
- Make hard controls, residual guards, prompt-governed controls, native state writes,
  and unobservable teammate behavior explicit in code, tests, receipts, and
  diagnostics.
- Preserve terminal parity, native Claude configuration, durable parent Agent
  identity, and the existing public lifecycle while failing closed across the
  orchestration Driver-version boundary.
- Establish a zero-cost regression path plus one deliberately authorized paid
  witness that consumes only real observable native events.

**Non-Goals:**

- Cross-top-level or arbitrary cross-session messaging, Workflow, teammate
  worktree/remote isolation, conversation forks, or nested teammate delegation.
- Plugin-owned teammate identities, mailboxes, progress, transcripts,
  completions, cost attribution, memory synchronization, or team cleanup.
- A filesystem sandbox, single-writer lock, exact teammate effort enforcement,
  hard team-size/creation enforcement, or claims that assistant prose proves a
  native event.
- Automatic recovery of an in-process team after the Claude process/transport
  is lost.

## Decisions

### 1. `claude_orchestrator` explicitly activates Native Agent Teams

`delegation_mode=claude_orchestrator` remains the sole public opt-in and is
displayed as “native team lead.” Exact Opus 5 joins Fable 5 as eligible. The
profile sets `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` only for that process and
the prompt explicitly requests named teammates rather than ordinary
subagents. Initialization must prove the definitions and necessary tool names,
but the first named Agent result must prove `status: teammate_spawned`. A
different result fails as Harness-incompatible and is never accepted as
native-team work. Because gate state is absent from init, the runtime cannot
prevent that first attempted call from taking Claude's ordinary path; it can
and must prevent silent acceptance.

This preserves the user-approved peer communication and shared-task behavior.
Ordinary unnamed subagents were rejected because they cannot provide the
required named teammate mailbox. Pretending the feature was “not Agent Teams”
was rejected after binary and official-doc evidence showed that named
`SendMessage` addressability is the Agent Teams transport.

### 2. Preserve the public parent lifecycle

No new `team`, `delegate`, child-list, child-wait, or child-message public tool
is added. Only the outer CC Agent/job/session is durable and recoverable. Native
teammate names and task state never become CC Agent cards, inbox events, or MCP
receipts.

Adding Plugin-side team operations was rejected because it would duplicate
Claude's task/mailbox scheduler and expose state the Plugin cannot resume with
the same guarantees as the parent.

### 3. Keep CLI override ownership in `execution-profile.mjs`

Add a pure `runtime/claude-native-team-policy.mjs` for reviewed role matrices,
prompts, teammate definitions, semantic limits, deny names, tool-name
canonicalization, and inventory classification. It returns semantic limits
such as `{ maxSpawnDepth: 1, maxConcurrentTeammates: 3 }`, never Claude
environment variable names or argument order.

`runtime/execution-profile.mjs` remains the only owner that maps policy to
`CLAUDE_CODE_*`, `--agents`, `--append-system-prompt`, and
`--disallowedTools`. The adapter only validates and serializes the resolved
definitions. Embedding policy in the adapter or letting the policy module emit
environment keys was rejected because it would split override ownership.

### 4. Inject three stable teammate definitions without call-level model override

An orchestrator injects exactly `haiku-scout`, `sonnet`, and `opus` through one
`--agents` JSON value. Definitions pin exact model IDs, set `memory: local`,
omit effort/background/isolation/permission/skills/MCP overrides, retain Native
Agent Teams task/messaging coordination, deny teammate delegation and reviewed
high-blast-radius tools, and include role/authority constraints.

The lead selects the named definition and includes the pinned model plus
intended effort in the brief, but omits the Agent call-level `model` parameter
because it takes precedence over the definition. The orchestrator profile
removes inherited `CLAUDE_CODE_SUBAGENT_MODEL`, which otherwise overrides both.
Claude's `availableModels` policy may still substitute and warn; the Plugin
does not silently substitute and does not claim an unobserved effective model.

Stable definition names deliberately own native local memory. Each job also
derives an opaque cohort label from the durable job ID for behavioral naming
and synthesis evidence; it is not a public identity and is not persisted in a
new field.

### 5. One process owns one fresh team; team turns do not auto-reconnect

The first named teammate forms one team under the current lead process. Native
team config is process/session-derived and cleaned when that process exits;
task-list artifacts may persist under the native config retention policy.
Claude does not restore in-process teammates when the parent session resumes.

Therefore leaf transport recovery remains unchanged, but orchestrator turns
set automatic reconnect attempts to zero. If transport closes after team work
may have started, the job returns its structured transport failure and durable
parent continuation evidence. A later explicit CC follow-up creates a new job,
new cohort label, and fresh native team in the exact parent Claude session. It
must not address earlier teammate names as live sessions.

Trying to reconstruct teammate sessions inside the same automatic retry was
rejected because official Claude behavior does not restore them and the Plugin
does not own their transcripts/mailboxes.

### 6. Classify numerical topology controls honestly

The policy instructs the lead to use at most three concurrently active
teammates and at most six teammate creations. The profile maps semantic limits
to `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=1` and
`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS=3`. Depth plus member `Agent` denial is
the enforceable no-second-generation boundary. The concurrency value does not
constrain native teammates and is retained only as a residual guard if an
ordinary-subagent path is attempted. Both native numerical budgets remain
prompt-governed because current Agent Teams have no hard size or creation cap.

No Plugin child counter is added because the stream does not provide a complete
recoverable teammate lifecycle. The final synthesis must report uncertainty
rather than claim the six-creation budget was runtime-enforced.

### 7. Use one reviewed deny matrix without a general allowlist

The common deny set includes `Workflow`, `ListAgents`, `ListPeers`,
`ScheduleWakeup`, reviewed cron/routine tools, `RemoteTrigger`,
`PushNotification`, `SendUserMessage`, `SendUserFile`, `SendFile`, and native
worktree switching. Leaves additionally deny `Agent` and `SendMessage`.
Teammates deny `Agent` while retaining `SendMessage` and shared task tools;
leads retain `Agent`, `SendMessage`, and shared task tools. Tool-input rules
forbid `isolation`, remote/worktree/fork paths, call-level model override, and
cross-session recipients in the prompt because `--disallowedTools` cannot
filter individual arguments.

No general allowlist is introduced, so hooks, MCP, skills, and new safe Claude
tools remain available. The policy canonicalizes init `Task` to `Agent` before
classification and excludes reviewed extension namespaces such as `mcp__*`
from “unknown native built-in” warnings. Classification uses the complete
normalized inventory before display/storage caps.

### 8. Validate definitions/tool policy at init and transport on first spawn

Static readiness requires `--agents` but never claims that Claude accepted the
definitions. On production init:

- leaf mode may continue without an inventory but remains
  `denySetLiveValidated:false`;
- orchestrator mode requires inventories containing `haiku-scout`, `sonnet`,
  and `opus`, and necessary coordination names canonicalized to `Agent`, `SendMessage`,
  `TaskCreate`, `TaskGet`, `TaskList`, and `TaskUpdate`;
- a reviewed forbidden tool, missing definition, or missing necessary
  coordination name maps to admitted Harness class `compatibility_surface_drift` and the
  existing `harness_incompatible` blocking reason;
- unknown non-forbidden native names warn but do not block.

The names above are necessary but do not prove the experimental server gate.
The adapter separately inspects the first named Agent tool result. Only
structured `status: teammate_spawned` sets
`teamTransportLiveValidated:true`; any ordinary-subagent result terminates the
turn as Harness-incompatible and cannot be used as native-team completion.

`denySetLiveValidated` means only “the reviewed deny set was observed clean.”
It is never described as universal containment. The latest sanitized
fingerprint/mode observations are capped at sixteen records with deterministic
oldest non-current eviction. Only names, policy revision, fingerprint/mode,
classification, and time are retained.

### 9. Treat route effort and write scope honestly

Every teammate brief states member type/pinned requested model, intended
effort, role, behavioral authority, write surface, acceptance evidence, and
stop boundary. Teammates inherit the lead effort; the final synthesis reports
intended effort separately from inherited or unknown effective effort.

`write:false` forbids task/workspace/repository/external mutation but explicitly
permits native memory maintenance only under
`.claude/agent-memory-local/<member-type>/`. With `write:true`, Sonnet and Opus
may write only declared non-overlapping surfaces. An Opus lead may implement; a
Fable lead should delegate substantive implementation but may write plans,
documentation, integration changes, and small unblockers. Haiku remains a
behavioral scout.

No global single-writer lock is added. This follows Codex Multi-Agent V2's
disjoint-write-set model: the lead assigns non-overlapping surfaces, does only
non-overlapping work while teammates run, then inspects the actual combined
diff and verification before synthesis.

### 10. Use native current-team delivery without Plugin polling

Claude supplies current-team rosters, automatic teammate messages, idle/failure
notifications, and a shared task list. The lead uses those events and inspects
actual deliverables; it does not repeatedly poll or treat a lagging task label
alone as proof of failure. Teammates may message current active teammates by
name. They must not send to arbitrary cross-session recipients or trigger a
completed teammate's auto-resume; only the lead may decide on current-turn
follow-up. This restriction is explicitly prompt-governed because `SendMessage`
can reach other sessions.

Before returning, the lead waits for all required native settle signals,
requests graceful teammate shutdown where applicable, inspects the actual
combined diff/tests, and returns one synthesis. The Plugin does not parse child
transcripts or create a second join mechanism.

### 11. Bump the Driver contract for hot-refresh safety

Change `CLAUDE_CODE_DRIVER_VERSION` from `claude-code@1` to
`claude-code@2`. The existing prepared-job version check prevents an old job
from launching under new team semantics and prevents a new job from launching
after rollback to the old Driver. Active-process interrupt/control remains
available because it does not reconstruct the route.

This is required even though the public MCP schema is unchanged: profile,
reconnect, team, and compatibility semantics are materially different.

### 12. Verify behavior with a direct production-Driver ephemeral witness

Fake-Claude tests own deterministic profile/argument/recovery/tool-drift and
paid-loop control-flow coverage. Before release, one explicit Opus 5/low,
`write:false` witness requires one Haiku scout and one Sonnet reviewer, one
current-team message, a successful parent synthesis, and an explicit
`settleObservation: unobservable` boundary for Claude 2.1.227. The witness does
not claim that parent success independently proves each teammate settled.

The witness invokes the real production Driver/profile/adapter directly rather
than the public MCP/detached-worker path. A witness-only in-process callback
receives the same bounded structured init/tool/team events emitted by the
adapter. It may count requested definition/type/name, first-spawn transport,
same-team message recipient, and successful terminal synthesis, but persists no prompt/message content,
session ID, transcript, or memory contents. Requested models are proven by the
injected definitions; effective teammate model, effort, and cost remain unknown
unless an authoritative structured fact exists. Assistant prose cannot replace
a missing event. Invented `system/teammate_idle`, `teammate_completed`, or
`teammate_failed` events are forbidden in the fake transport.

This avoids a second cross-process IPC or durable event ledger. Zero-cost
public API/integration tests continue to validate the MCP and detached-worker
lifecycle; the paid witness claims only the direct production
Driver/profile/adapter path.

The smoke script creates a dedicated disposable Git witness workspace containing
only fixed non-secret fixtures, snapshots every path there, and never uses the
source checkout as Claude's cwd. The mutation gate permits only the two expected
local-memory prefixes and fails on any other disposable-workspace mutation. It
also verifies the source checkout stayed unchanged and records bounded
memory-path metadata without opening file contents. The explicit witness command
uses the normal environment owner plus Driver preflight/revalidation, never a
fixture executable or fingerprint.
If Claude reports a subscription/quota limit, no later paid call starts and the
capability remains unverified. Real Claude never runs in `npm run check`.

## Risks / Trade-offs

- **Agent Teams are experimental and server-gated** -> orchestrator-only env,
  init definition/tool preconditions, first-spawn `teammate_spawned` proof,
  rejection of ordinary-subagent output, explicit Harness-incompatible result.
- **Native team session resumption is unsupported** -> zero automatic reconnect
  for orchestrator turns; explicit parent follow-up creates a fresh team.
- **Prompt-governed roles/recipients/budgets can be violated under permission
  bypass** -> label them, hard-deny stable tools, inspect actual output/diff,
  retain Codex as final acceptor.
- **Native local memory writes inside the workspace and may race** -> allow only
  exact memory prefixes for read-only acceptance, never read/lock/merge/clean
  contents, and separate task-state mutation evidence.
- **Available-model policy may substitute a pinned request** -> remove competing
  overrides, never add Plugin fallback, and record effective model as unknown
  unless native evidence proves it.
- **Team-size concurrency has no hard limit** -> explicit behavioral budget;
  the concurrency env guards only the forbidden ordinary-subagent path, and
  lead synthesis reports native-team uncertainty.
- **`SendMessage` can reach other sessions and resume completed agents** ->
  current-team recipient/lead-only resume prompt, no universal containment claim.
- **Init inventories may drift and do not prove the team gate** -> canonical
  aliases, necessary preconditions, first-spawn proof, scoped validation,
  unknown-native warning, bounded history.
- **Structured production stream omits stable teammate settle facts** -> record
  settle as unobservable for the exact executable, prohibit invented fake
  events, and scope paid acceptance to the narrower definition/spawn/message/
  parent-synthesis path.

## Migration Plan

1. Add red tests for the role matrix, Native Agent Teams env, stable definitions,
   definition-owned models, semantic-limit mapping, deny matrix, init aliases,
   definition admission, memory override, Driver-version boundary, and
   no-reconnect team behavior.
2. Implement the pure policy, profile composition, adapter serialization,
   structured ephemeral events, and Driver/job integration behind the unchanged
   public API.
3. Add bounded observation persistence and doctor projection; update all model-
   visible skill/MCP guidance and fake witness coverage.
4. Run focused tests, OpenSpec validation, `npm run check`, and independent
   fixed-diff reviews.
5. With explicit paid-test authorization, run the single Opus-low witness and
   stop on quota/subscription limits or missing native evidence.
6. Only after independent review and user acceptance, perform separately
   authorized version, install, merge, archive, release, and publication.

Rollback restores `claude-code@1` and Fable-only opaque orchestration. Prepared
`@2` jobs fail closed under the old Driver; active-process interrupt remains
available. Existing parent Agents and Claude sessions remain durable. Native
team task-list and local-memory artifacts stay under Claude's retention and are
not deleted by the Plugin.

## Open Questions

None that changes the approved contract or implementation breakdown. Future
Claude tool names and whether a later version emits additional structured
teammate evidence are handled by the defined compatibility/witness policy.
