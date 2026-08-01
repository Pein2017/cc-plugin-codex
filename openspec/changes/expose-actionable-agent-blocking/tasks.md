## 1. Close the failure vocabulary at the Driver contract

- [x] 1.1 Add a checkout-owned closed turn-failure vocabulary beside `runtime/harness-capabilities.mjs` that declares each admitted class and its blocking scope, with no caller, ambient, or persisted override path.
- [x] 1.2 Prove the admitted set covers every class reachable from `classifyClaudeFailure` in `runtime/claude-headless-adapter.mjs` plus the in-turn overrides in `runtime/job-supervisor.mjs`, and excludes the supervisor-owned facts: pre-launch compatibility refusal, worker launch failure, worker handoff failure, forced unflushed interruption, and stale-job reaping.
- [x] 1.3 Tighten `validateHarnessTurnResult` in `runtime/harness-contract.mjs` to reject an unadmitted, empty, or free-text `failure.class` before it reaches durable continuation evidence.
- [x] 1.4 Confirm `runtime/claude-code-driver.mjs` emits only admitted classes and that no existing Claude parity fixture expectation changes.

## 2. Derive the blocking projection

- [x] 2.1 Add the nine-value public reason vocabulary `auth_required`, `account_limit`, `harness_incompatible`, `transport_exhausted`, `session_lost`, `interrupted_unflushed`, `route_unsupported`, `worker_lost`, `unclassified`, each with one fixed scope.
- [x] 2.2 Implement the presence rule over terminal facts: `null` for completed and for interrupted with proven safe flush; non-null for failed and for interrupted without proven safe flush.
- [x] 2.3 Implement the fixed precedence: Harness-scoped outranks Agent-scoped, an admitted turn class outranks supervisor-origin evidence, supervisor-origin evidence decides only when no turn class exists, and `unclassified` is the sole fallback.
- [x] 2.4 Derive `retry` from the Agent's continuation mode only, never from a second recoverability judgement.
- [x] 2.5 Assert derivation purity: no timestamp, counter, attempt total, elapsed interval, ordering dependence, or filesystem read, so repeated derivation of an unchanged terminal fact is byte-identical.
- [x] 2.6 Prove mapping totality: every admitted turn-failure class and every named supervisor-origin fact has an explicit, tested mapping entry, so none of them falls through to `unclassified` by omission. `unclassified` remains expected and correct for the Driver's own generic `protocol_unknown`/`fatal` classes, and is the sole fallback for a genuinely unknown or absent fact — it is not claimed to be unreachable overall.

## 3. Deliver blocking evidence in the frozen completion payload

- [x] 3.1 Add `blocking` to the frozen first-delivery payload and the public completion projection in `runtime/completion-inbox.mjs`.
- [x] 3.2 Project `blocking: null` for a payload frozen before this change, with no recomputation and no backfill into an immutable payload.
- [x] 3.3 Extend `sameCompletionFact` with a structural comparison for `blocking`, matching how `resumability` is compared rather than the scalar identity scan.
- [x] 3.4 Confirm repeated waits and lists over a settled failed Agent acquire no persistence lock, call no fsync, and write no durable state.
- [x] 3.5 Surface `blocking` on the `wait_agent` receipt in `runtime/agent-runtime.mjs` without adding an operation, status value, or MCP output schema.

## 4. Redact blocked activation rejections

- [x] 4.1 Replace the raw `continuation.evidence.reason` interpolation in the three blocked paths in `runtime/agent-runtime.mjs` with the closed reason, scope, and retry values.
- [x] 4.2 Verify no model-facing path reads `job.errorMessage`, `result.failureReason`, `result.warning`, standard error, or `manualResumeCommand`.
- [x] 4.3 Confirm operator diagnostics still expose the exact internal class, session, attempt, and receipt evidence unchanged.

## 5. Update model-facing guidance

- [x] 5.1 Update `wait-agent` guidance with the presence rule, the `scope` branch, and that a graceful interrupt reporting `blocking: null` is not a failed lane.
- [x] 5.2 Update `send-message` and `followup-task` guidance so a blocked rejection is read as the closed triple, and `retry: new_agent` means the blocked identity and name are not reusable.
- [x] 5.3 Update `spawn-agent` guidance so a Harness-scoped block reuses the existing account-limit stop rule instead of introducing a second stop rule.
- [x] 5.4 Record the completed-with-question convention: answer with `followup_task` on the same Agent, never spawn a replacement, and never read a status from message text.
- [x] 5.5 Confirm the aggregate Skill word count stays at or below 1,800 and every existing `plugin-contract` marker remains present.

## 6. Add focused and fake-Claude tests

- [x] 6.1 Driver contract: an unadmitted class is rejected, the admitted set is exhaustive, and a supervisor-owned fact submitted as a Driver class is rejected.
- [x] 6.2 Mapping: account exhaustion beats accompanying transport evidence, a turn class beats an operator message, reaping and other named worker-lifecycle facts (which are live today) resolve without a turn class, a terminal fact whose structured field already carries the Harness-incompatibility value resolves to `harness_incompatible` at the pure-mapping level (no current code path produces that value — see design.md Decision 1), and an unrecognized fact yields `unclassified`.
- [x] 6.3 Presence: completed yields `null`, graceful flush-proven interruption yields `null` and stays resumable by follow-up, unflushed interruption yields `interrupted_unflushed`, and a failed turn with no outer-assistant text yields a non-null triple instead of today's empty `completion_message`.
- [x] 6.4 Freeze compatibility: a pre-change frozen event redelivers `blocking: null`, and a new event freezes once and redelivers byte-identically under its original token.
- [x] 6.5 Idempotence: repeated settled observation performs zero durable writes, and a genuine correction of an unread unfrozen event converges in one step.
- [x] 6.6 Redaction: assert against the literal operator strings produced at `runtime/job-store.mjs:877-882` and `runtime/job-supervisor.mjs:508-511` so a reintroduced fallback fails loudly.
- [x] 6.7 Fake-Claude integration in `tests/runtime-integration/runtime-cli.test.mjs`: drive auth loss, account limit, session drift, reaped worker, and graceful interruption end to end and assert the exact wait receipt.
- [x] 6.8 Plugin contract: Skill word budget and required markers still pass.

## 7. Verify acceptance

- [x] 7.1 Run `openspec validate expose-actionable-agent-blocking --strict` and reconcile every failure against the proposal, design, and delta specs.
- [x] 7.2 Run `npm run check` from an environment without inherited `CC_TRUSTED_OWNER_ROOT_ID`, `CLAUDE_NATIVE_CONFIG_DIR`, or `CC_RUNTIME_ENV_FILE`, and confirm it is fully green.
- [x] 7.3 Record that no real Claude Code smoke is required: this change alters only projection, redaction, and guidance, crosses no Claude CLI boundary, and the design explicitly excludes detection and CLI behavior changes.
- [x] 7.4 Confirm the diff adds no public operation, status value, MCP output schema, generation bump, persisted Agent or job field, durable schema version bump, detection change, unblock or name-release affordance, second Driver, release, or installation action.
