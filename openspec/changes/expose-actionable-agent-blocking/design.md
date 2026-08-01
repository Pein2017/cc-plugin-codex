## Context

The archived `generalize-agent-runtime-with-harness-drivers` change fixed a Harness-neutral
supervisor with a closed, fail-closed capability vocabulary
(`runtime/harness-capabilities.mjs:12-21`). It did not close the sibling concept: a
non-completed turn must classify a failure, but `validateHarnessTurnResult` accepts any
non-empty string for `failure.class` (`runtime/harness-contract.mjs:185-200`).

That open string flows into durable state and then into model-facing text. On the
delivery side it is discarded: `publicAgentCompletionSummary` emits the fixed
`Agent turn failed.` (`runtime/completion-inbox.mjs:489-502`) and `completion_message`
resolves to `job.result.rawOutput`, which the Driver sets to `""` for a failed turn with
no outer-assistant text (`runtime/claude-code-driver.mjs:101,124`), so the lead cannot
distinguish auth loss, account exhaustion, CLI incompatibility, exhausted transport
recovery, or session drift. On the rejection side it is over-shared: the blocked-Agent
paths interpolate `continuation.evidence.reason` verbatim
(`runtime/agent-runtime.mjs:976,1046,1074`), which under the
`?? job.errorMessage` fallback (`runtime/job-store.mjs:129`) can be an operator sentence
containing a PID (`runtime/job-store.mjs:877-882`) or a `claude --resume <session-id>`
command (`runtime/job-supervisor.mjs:508-511`).

Both surfaces already have the evidence they need. `classifyClaudeFailure`
(`runtime/claude-headless-adapter.mjs:514-602`), the in-turn supervisor overrides
(`runtime/job-supervisor.mjs:377-426`), and terminal recoverability
(`runtime/job-store.mjs:99-130` → `runtime/agent-store.mjs:718-749`) already determine
exactly what happened and whether the Agent can continue. This design is a projection and
redaction boundary, not new detection.

## Goals / Non-Goals

**Goals:**

- Close the Driver failure vocabulary and give each admitted class an explicit blocking
  scope, mirroring the existing closed capability treatment.
- Project one nested, closed `blocking` object on `wait_agent` completion updates whose
  terminal fact stopped the turn against the parent's intent, and on blocked-Agent
  activation rejections.
- Establish a single deterministic mapping with explicit precedence, so both surfaces
  answer from one table rather than two ad-hoc derivations.
- Keep the frozen-payload immutability, settled-wait no-write, and root-isolation
  invariants exactly as they are today.
- Remove operator-only vocabulary from every model-facing failure surface without
  reducing what operator diagnostics retain.

**Non-Goals:**

- No `needs-input` durable status and no sixth model-facing status value.
- No new lifecycle operation, no change to the seven public operation names, no MCP
  `outputSchema`, and no `CC_MCP_API_GENERATION` bump.
- No change to failure detection. `classifyClaudeFailure` keeps its current match text,
  including the Agent's own `finalMessage`; tightening it is a separate later change.
- No automatic recovery, retry, model substitution, or Harness fallback.
- No unblock, close, archive, or name-release affordance. A blocked Agent stays a
  permanently dead identity and this change only makes that legible.
- No durable schema version bump and no new persisted Agent or job field.
- No second Driver, public `harness` selector, release, install, or Plugin refresh.

## Decisions

### 1. Two vocabularies with one owner each, not one shared bag

Turn-origin failures are Driver facts; supervisor-origin failures are not. Admitting both
into the Driver contract would let a Driver claim a supervisor fact such as a reaped
worker.

- **Driver turn classes** (closed; validated by `validateHarnessTurnResult`):
  `auth_or_permission`, `usage_or_subscription_limit`, `context_or_request_invalid`,
  `transport_closed_resumable`, `protocol_session_drift`, `session_owner_conflict`,
  `cancelled_or_interrupted`, `protocol_unknown`, `fatal`. These are exactly the classes
  reachable through `classifyClaudeFailure` plus the two in-turn overrides the Driver's
  own session call applies (`runtime/job-supervisor.mjs:377-426`).
- **Supervisor-origin evidence** stays outside that vocabulary: pre-launch compatibility
  refusal, `worker_launch_failed`, `worker_handoff_failed`, `worker_reaped`, forced
  unflushed interruption, and stale-job reaping. The supervisor owns these because no turn
  result exists when they occur. `worker_launch_failed`, `worker_handoff_failed`,
  `worker_reaped`, and forced unflushed interruption are live today: each is tagged onto an
  existing `job.failureClass`/`job.result.failureClass` field by the code path that observes
  it, and reaches a model-facing completion through the ordinary terminal-job pipeline.
  Pre-launch compatibility refusal is not: it fails while the job is still
  `preClaudeLaunch: true`, so it is excluded from completion reconciliation
  (`isPreClaudeJob`, `runtime/job-store.mjs:783`) and never reaches a model-facing wait. It
  surfaces today as a synchronous, already-sanitized runtime error outside the completion
  pipeline. `harness_incompatible` stays in the closed vocabulary as the mapping a
  structured Harness-incompatibility fact would resolve to if one ever reached a terminal
  job record, not as a claim that the current pre-launch path produces one.

**Alternative considered:** one flat class list covering both. Rejected because it makes
the Driver contract the owner of facts a Driver cannot observe, and would require the
supervisor to trust a Driver-supplied worker-lifecycle claim.

### 2. `blocking` is a projection, never a persisted Agent field

The triple is derived from the terminal job fact at two moments: when a completion payload
is first frozen, and when an activation rejection is raised. Nothing new is written to the
Agent record.

This is possible because both surfaces already trace to the same source.
`continuation.evidence.reason` is computed from `job.result.failureClass`
(`runtime/job-store.mjs:99-130`), and the completion event is built from the same terminal
job (`runtime/completion-inbox.mjs:870-917`). A persisted field would add a version-2
schema change carrying no information the terminal fact does not already have.

**Alternative considered:** persist the triple on the Agent record beside
`continuation.evidence`. Rejected: it forces a durable schema bump, creates a second
source that can drift from the terminal job, and buys nothing because the delivery payload
is frozen anyway.

### 3. Presence rule is enumerated over terminal facts, not over status

`blocking` describes a turn that stopped against the parent's intent. Terminal status
alone does not decide that, because `interrupted` covers two materially different facts.
The rule is therefore stated over the terminal fact and is exhaustive:

| terminal fact | `blocking` |
| --- | --- |
| `completed` | `null` |
| `interrupted`, receipt proves a safe flush | `null` |
| `interrupted`, no proven safe flush | non-null, `interrupted_unflushed` |
| `failed` | non-null |

A graceful user-requested interrupt with a proven flush is the parent's own successful
action, not an obstruction: the Agent stays resumable by `followup_task` on the same
durable Agent and native session, exactly as the existing interrupt contract already
guarantees. Reporting it as blocked would tell the lead to abandon an identity it
deliberately paused. Only the unflushed case is a genuine loss, and it already has an
admitted reason.

The public reason vocabulary therefore stays at the nine values the proposal accepted:

| reason | scope | typical retry |
| --- | --- | --- |
| `auth_required` | harness | operator_required |
| `account_limit` | harness | operator_required |
| `harness_incompatible` | harness | operator_required |
| `transport_exhausted` | agent | from continuation |
| `session_lost` | agent | new_agent |
| `interrupted_unflushed` | agent | new_agent |
| `route_unsupported` | agent | from continuation |
| `worker_lost` | agent | from continuation |
| `unclassified` | agent | from continuation |

Note that `blocking: null` does not mean resumable and non-null does not mean dead. A
transport-exhausted turn that kept its exact session is non-null with
`retry: same_agent_followup`. Presence answers "did something stop this turn that the
parent did not ask for", and `retry` separately answers "what can be done next".

**Alternative considered:** make presence total over status, so every non-`completed`
outcome carries `blocking`, adding an `interrupted_by_request` reason for the graceful
case. Rejected: it enlarges the accepted vocabulary to describe a non-event, and it
invites the lead to treat its own successful interrupt as a failed lane.

**Alternative considered:** derive presence from resumability instead. Rejected because
`transport_exhausted` with a surviving exact session is both resumable and genuinely
blocking, so resumability answers a different question.

### 4. Mapping precedence is fixed and asymmetric by design

Several pieces of evidence can be true at once. Precedence, highest first:

1. **Harness-scoped conditions outrank Agent-scoped conditions.** `auth_or_permission` and
   `usage_or_subscription_limit` decide the reason regardless of any accompanying transport
   or session evidence in the same terminal fact; a structured `harness_incompatible` fact
   would rank the same way if one ever reached this mapping (today it does not — see
   Decision 1). The costs are asymmetric: reporting a Harness outage as an Agent problem
   makes the lead burn every remaining Agent name and spend against a dead Harness, while
   the converse costs one unnecessary stop. This also matches the precedent already in the
   supervisor, where `usage_or_subscription_limit` already suppresses transport retry
   (`runtime/job-supervisor.mjs:70`).
2. **Turn-origin class outranks supervisor-origin evidence.** When
   `job.result.failureClass` is present it decides, and `job.errorMessage` is never read.
   This is what makes the `?? job.errorMessage` fallback unreachable for model-facing
   projection.
3. **Supervisor-origin evidence decides only when no turn-origin class exists** — worker
   launch, handoff, and reaping map to `worker_lost`; `harness_incompatible` remains the
   closed mapping a structured Harness-incompatibility fact would resolve to, but no
   current supervisor code path records that structured value on a terminal job (Decision 1).
4. **`unclassified` is the only fallback,** and it is a closed value rather than a
   free-text passthrough. It is the expected outcome for the Driver's own generic
   `protocol_unknown`/`fatal` classes, and the fallback for any terminal fact whose
   structured fields name neither an admitted turn class nor a known supervisor literal.

`scope` is a fixed property of the reason. `retry` derives from the Agent's continuation
mode at rejection or freeze time: an `exact_session` continuation yields
`same_agent_followup`; `blocked` with `scope: agent` yields `new_agent`; `blocked` with
`scope: harness` yields `operator_required`. A `safe_fresh` continuation also yields
`same_agent_followup` for a `failed` terminal fact, because it proves no side effect
occurred; it does not for an `interrupted` terminal fact, because it proves no side effect
occurred but not that this specific turn's transcript flushed, so an interrupted turn with
`safe_fresh` still yields `interrupted_unflushed`/`new_agent`, the same as `blocked`. That
reuses the existing continuation decision rather than adding a second recoverability
judgement.

### 5. Frozen payloads are never recomputed

`completion-delivery` already requires first delivery to freeze the public payload and
redeliver it byte-identically against later reconciliation. `blocking` lives inside that
frozen payload.

A completion frozen before this change carries no `blocking` key. On redelivery it
projects `blocking: null` and is never recomputed, because recomputation would violate the
immutability guarantee that makes at-least-once delivery safe across a crash. Absence on
read therefore means `null`, which is also what a `completed` event projects — so the
output is unambiguous even though the storage states differ.

**Alternative considered:** compute `blocking` outside the frozen payload from the current
Agent record. Rejected: a later follow-up changes the Agent lifecycle, so the computed
value could contradict the frozen terminal status the same token already delivered.

### 6. Derivation must be pure so settled waits stay write-free

`completion-delivery` requires a fully settled wait to acquire no lock, call no fsync, and
write no durable state. Two constraints follow, and they are load-bearing rather than
stylistic:

- The derivation is a pure function of the terminal job fact. No timestamp, counter,
  attempt count, elapsed interval, or filesystem read may enter it. An impure value would
  differ on every reconcile, making `sameCompletionFact` report a changed fact and turning
  every `list_agents` and `wait_agent` call into a lock-and-fsync correction.
- `blocking` is added to `sameCompletionFact` (`runtime/completion-inbox.mjs:504-522`) as a
  structural comparison, in the same way `resumability` is compared, rather than by the
  `===` scan used for scalars. Omitting it would silently ignore a genuine correction;
  including it with an impure value would never converge. Purity plus inclusion converges
  in one step.

### 7. Redaction is enforced by construction, not by filtering

Every model-facing field is built from the closed enum table. No string is copied from
`job.errorMessage`, `result.failureReason`, `result.warning`, `stderr`,
`manualResumeCommand`, or `continuation.evidence.reason` into any of the seven receipts.
That structurally excludes PIDs, native session IDs, executable paths, workspace paths,
resume commands, and foreign-root evidence — the categories the current fallback leaks.

Operator diagnostics are unchanged and remain the only path to the exact class, session
evidence, attempts, and receipts. That is why `runtime-operations-diagnostics` needs no
requirement change: it already guarantees this evidence, and this change only stops the
model-facing side from duplicating it badly.

### 8. Nested object over flat keys

`blocking` is one nested object rather than three `blocking_*` keys. Flat keys would be
three independently nullable fields with an implicit "all or none" rule that nothing
enforces; a single nullable object makes the presence rule from Decision 3 structural.

## Risks / Trade-offs

- **[Vocabulary ossifies before a second Driver exists]** → The set is checkout-owned and
  versioned with the Driver contract, exactly like capabilities. A second Driver extends it
  in its own OpenSpec with real evidence, and an unknown value fails closed rather than
  degrading silently.
- **[Harness-scoped precedence over-stops the lead]** → Only two turn classes are
  harness-scoped and currently reachable (`auth_or_permission`,
  `usage_or_subscription_limit`); `harness_incompatible` reserves a third Harness-scoped
  slot for a structured fact no current code path produces (Decision 1), so it cannot
  over-stop anything today. Each reachable condition is a genuine host-wide condition. The
  asymmetric-cost argument in Decision 4 is the accepted trade: one unnecessary stop is
  cheaper than exhausting an account against a dead Harness.
- **[Derived rejection disagrees with a frozen completion]** → Both derive from one terminal
  job fact. A rejection is a live derivation, not a redelivery, so a legacy frozen `null`
  and a freshly derived triple can coexist without contradiction; only redelivery is bound
  by immutability.
- **[Spurious completion corrections cause lock and fsync churn]** → Purity requirement
  plus `sameCompletionFact` inclusion, guarded by a regression test that asserts zero
  durable writes across repeated waits and lists over a settled failed Agent.
- **[`unclassified` becomes the common case]** → The mapping must be total over the current
  turn-origin class set, proven by an exhaustiveness test rather than by inspection.
- **[Redaction regresses silently]** → Tests assert against the literal operator strings
  currently produced at `runtime/job-store.mjs:877-882` and
  `runtime/job-supervisor.mjs:508-511`, so a reintroduced fallback fails loudly.
- **[Deferred detection tightening keeps a misclassification path open]** → Accepted and
  recorded: `classifyClaudeFailure` still scans the Agent's own `finalMessage`, so a failed
  turn discussing quotas can still be classed `account_limit`. This change makes that
  misclassification *visible* to the lead for the first time, which is a prerequisite for
  fixing it rather than a regression.

## Migration Plan

1. Add the closed Driver failure vocabulary beside `runtime/harness-capabilities.mjs` and
   tighten `validateHarnessTurnResult` to reject an unadmitted class under the existing
   contradictory-evidence rule.
2. Add the pure mapping from terminal job fact to `(reason, scope, retry)` with the
   Decision 4 precedence, and prove exhaustiveness against the current turn-origin set.
3. Project `blocking` into the frozen completion payload at first delivery, extend
   `sameCompletionFact` structurally, and confirm settled waits still perform no durable
   write.
4. Replace the raw-reason interpolation in the three blocked-Agent rejection paths.
5. Update `wait-agent`, `send-message`, `followup-task`, and `spawn-agent` guidance within
   the unchanged 1,800-word aggregate budget (currently 1,342).
6. Run the focused projection, completion-inbox, driver-contract, plugin-contract, and
   fake-Claude integration suites, then `npm run check`.

**Rollback boundary.** Rollback is safe at every step and requires no data repair. There is
no durable schema version bump and no new persisted Agent or job field; the only durable
change is one additional key inside already-versioned completion events. A pre-change
runtime projects a fixed field list (`runtime/completion-inbox.mjs:463-482`) and compares a
fixed field list, so it ignores the unknown key. If it re-normalizes an unread, unfrozen
event it drops `blocking` and behaves exactly as it does today; frozen payloads are
immutable and are not rewritten. Rolling forward re-derives the triple from the same
terminal fact. No Agent becomes unusable, no completion is lost, and no session lease or
root ownership changes in either direction.

## Open Questions

None. The presence rule for a gracefully interrupted Agent is settled in Decision 3: a
proven safe flush carries `blocking: null` and stays resumable, only an unflushed
interruption is blocking, and the public reason vocabulary remains the nine accepted
values.

Whether `worker_lost` should eventually split into
launch, handoff, and reaping variants is deliberately deferred until a second Driver
provides evidence that the distinction changes a lead decision.
