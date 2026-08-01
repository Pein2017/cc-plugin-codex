## Why

A model-facing join that observes a failed Agent currently receives no actionable
evidence. Verified current behavior: `publicAgentCompletionSummary` emits the fixed
string `Agent turn failed.` (`runtime/completion-inbox.mjs:489-502`), and
`completion_message` resolves to `job.result.rawOutput`
(`runtime/completion-inbox.mjs:907-912`), which the Driver sets to `""` when a failed
turn produced no outer-assistant text (`runtime/claude-code-driver.mjs:101,124` →
`runtime/internal-runtime.mjs:1145,1151`). Because `??` does not coalesce `""`, the
richer fallbacks are unreachable. Auth loss, account-limit exhaustion, an incompatible
Claude CLI update, exhausted transport recovery, and exact-session drift are therefore
indistinguishable to the Codex lead: all five return `agent_status: "failed"`, a fixed
summary, and an empty message.

The runtime already classifies every one of these conditions
(`classifyClaudeFailure`, `runtime/claude-headless-adapter.mjs:514-602`) and already
persists the result as `job.result.failureClass` and `continuation.evidence.reason`
(`runtime/job-store.mjs:99-130`, `runtime/agent-store.mjs:718-749`). The defect is
projection, not detection. The complementary path leaks the opposite way: activation
rejections interpolate the raw internal reason directly into model-facing text
(`runtime/agent-runtime.mjs:976,1046,1074`), so an operator sentence such as
`Control process 12345 died or changed identity without completing. Auto-reaped.`
(`runtime/job-store.mjs:877-882`) reaches the model verbatim through
`sanitizedError` (`runtime/mcp-server.mjs:177-184`).

Now is the right time because `generalize-agent-runtime-with-harness-drivers` has just
been archived and its `harness-driver-runtime` capability is fixed into
`openspec/specs/`. That contract made capabilities a closed, fail-closed vocabulary but
left `failure.class` an unvalidated non-empty string
(`runtime/harness-contract.mjs:185-200`). Closing that gap before a second Driver exists
prevents an arbitrary Harness string from becoming durable continuation evidence and
model-visible prose.

## What Changes

- Close the Driver failure vocabulary. `failure.class` is validated against a fixed set
  exactly as capabilities already are (`runtime/harness-capabilities.mjs:12-21`), and
  each admitted class declares whether it blocks one Agent or the whole Harness
  instance. An unknown class is rejected under the existing contradictory-evidence rule
  rather than persisted.
- Project one nested `blocking` object on the `wait_agent` completion update carrying
  closed `reason`, `scope` (`agent` or `harness`), and `retry` (`same_agent_followup`,
  `new_agent`, or `operator_required`). It is non-null for every `failed` terminal fact
  and for an `interrupted` terminal fact without proven safe flush, and `null` for a
  `completed` terminal fact and for a graceful `interrupted` terminal fact whose receipt
  proves a safe flush, because that Agent remains resumable on its own identity. All
  three values derive from evidence the runtime already stores; no new detection runs.
- Build `send_message` and `followup_task` rejections against a blocked Agent from the
  same closed vocabulary instead of the raw `continuation.evidence.reason`, removing the
  current PID, reaping-vocabulary, native-session-ID, and `claude --resume` leaks from
  model-facing text.
- Extend parent join policy so the lead branches on `scope`: `harness` stops further
  spawns in that workflow and preserves the existing account-limit stop rule, while
  `agent` re-delegates one lane and leaves sibling Agents running.
- Record the completed-turn convention for an Agent that ends its turn asking a
  question: it is an ordinary `completed` join answered with `followup_task` on the same
  exact session, and `blocking` stays `null` regardless of message content.

**Non-goals** (each an explicit lead decision, not an omission):

- No `needs-input` durable status and no sixth model-facing status value. The Harness
  emits no structured signal for it; only the Agent's own prose, and persisting
  self-report as lifecycle state contradicts the closed-evidence rule in
  `harness-driver-runtime`. The existing completion convention already preserves the
  exact session and the complete final message.
- No new lifecycle operation, no change to the seven public operation names, and no MCP
  `outputSchema`. `TOOL_DEFINITIONS` declares only `inputSchema` and `annotations`
  (`runtime/mcp-server.mjs:58-120`), so this projection is additive with no
  `CC_MCP_API_GENERATION` bump, discovery refresh, or new Codex task.
- No change to failure *detection*. Tightening `classifyClaudeFailure`, whose match text
  currently includes the Agent's own `finalMessage`
  (`runtime/claude-headless-adapter.mjs:536-561`), is deferred so a classification change
  can never be mistaken for a projection regression.
- No automatic recovery, retry, model substitution, or Harness fallback.
- No unblocking, close, archive, or name-release affordance. A blocked Agent stays a
  permanently dead identity (`runtime/agent-runtime.mjs:976,1046,1074`;
  `runtime/agent-store.mjs:878-882`); this change only makes that state legible through
  `retry: new_agent`.
- No durable schema version bump and no new persisted Agent or job field. The only
  additive durable shape change is `blocking` inside the already-versioned frozen
  completion payload; both model-facing surfaces derive it from the terminal job fact
  already reached through `runtime/job-store.mjs:99-130`.
- No second Harness, public `harness` selector, release, install, Plugin refresh, or
  `pein-agents` rename.

**Lifecycle ordering.** This change depends on the archived
`2026-08-01-generalize-agent-runtime-with-harness-drivers` already being fixed into the
owning specifications; its closed capability vocabulary and normalized turn result are
the seam the failure vocabulary attaches to. It must land before the deferred
failure-detection change, so that change can be judged purely as a classification
change against a stable projection contract.

## Capabilities

### New Capabilities

None. Every requirement change attaches to an existing capability.

### Modified Capabilities

- `harness-driver-runtime`: "Harness Drivers own one complete native turn" currently
  requires only that a non-completed turn classify *some* failure. It gains a closed
  failure vocabulary, per-class blocking scope, and fail-closed rejection of an
  unadmitted class, mirroring the existing closed capability treatment.
- `completion-delivery`: "Completion events use two-phase at-least-once delivery"
  enumerates the public update and requires first delivery to freeze that payload. It
  gains bounded `blocking` evidence inside the frozen payload, the rule that a
  pre-change frozen event redelivers `blocking: null` rather than recomputing, and the
  continued exclusion of PIDs, native session IDs, resume commands, and raw internal
  reason text.
- `canonical-agent-orchestration`: "wait_agent returns bounded root mailbox activity"
  enumerates exactly what a completion update contains; the activation-blocked scenarios
  under "send_message never activates an idle Agent" and "followup_task guarantees
  activation" currently say only "blocking evidence"; "Parent orchestration uses
  explicit join policy" has no scope-driven stop rule. All three change, plus the new
  completed-with-question convention, within the unchanged Skill word budget.
- `typed-mcp-orchestration`: "MCP receipts remain complete and structured" currently
  asserts that wait completion delivery "SHALL remain unchanged" and requires
  continuation and recovery errors to stay actionable while excluding raw private state.
  That assertion becomes stale and is updated minimally to admit the bounded `blocking`
  object and the closed-vocabulary error text, without introducing an output schema or a
  generation bump.

`agent-thread-registry`, `durable-runtime-state`, `claude-session-execution`, and
`runtime-operations-diagnostics` are deliberately excluded: deriving both surfaces from
the existing terminal job fact means no registry field, no state mapping, no detection
rule, and no operator diagnostic requirement changes.

## Impact

Projection and rejection surfaces: `publicAgentCompletionSummary`, `publicEvent`,
`normalizeCompletionInput`, and `sameCompletionFact`
(`runtime/completion-inbox.mjs:428-522`); `publicCompletionUpdate` and the three blocked
rejections (`runtime/agent-runtime.mjs:308-321,976,1046,1074`). `sameCompletionFact`
must include the new field or re-derivation will trigger spurious corrections and break
the settled-wait no-write invariant.

Driver contract: failure validation in `validateHarnessTurnResult`
(`runtime/harness-contract.mjs:185-200`), a closed vocabulary module alongside
`runtime/harness-capabilities.mjs`, and the failure block of `normalizeTurnResult`
(`runtime/claude-code-driver.mjs:115-123`). Mapping sources are unchanged:
`runtime/job-store.mjs:99-130` and `runtime/agent-store.mjs:718-749,806-814`.

Model-facing guidance: `wait-agent`, `send-message`, `followup-task`, and `spawn-agent`
under `plugins/cc-for-pein/skills/`. The seven Skills currently total 1,342 of the 1,800
aggregate word budget, so the scope, retry, and completed-with-question guidance fits
without relaxing that bound.

Tests: `tests/runtime/agent-completion-projection.test.mjs` (no test today asserts a
*failed* Agent's `completion_message`, a real coverage gap this change closes),
`agent-launch-boundary.test.mjs`, `harness-driver-contract.test.mjs`,
`completion-inbox.test.mjs`, `plugin-contract.test.mjs`, and the fake-Claude
`tests/runtime-integration/runtime-cli.test.mjs`. No real-Claude smoke is required
because no CLI-boundary behavior changes.

This change introduces no runtime or source dependency, no remote or versioned-Cache
source, no raw provider API, no public tool or schema generation change, and no release
or installation action.
