## 1. Completion Inbox

- [ ] 1.1 Define and validate a versioned root-owned completion-event, opaque delivery-token, and contiguous acknowledgement-cursor schema with deterministic event identity and platform-appropriate storage protection.
- [ ] 1.2 Implement atomic append, oldest-contiguous unread delivery, later token acknowledgement, rejection of skipped-prefix acknowledgement, bounded compaction, and idempotent reconciliation for terminal jobs missing events.
- [ ] 1.3 Emit exactly one completion event from every completed, interrupted, failed, and cancelled transition, including self-contained summary and resumability evidence.
- [ ] 1.4 Add bounded wait for a target job or next root completion that may acknowledge tokens from a prior response but never acknowledges newly returned events in the same call.
- [ ] 1.5 Add restart, concurrent-reader, response-loss/redelivery, skipped-prefix acknowledgement, successful later acknowledgement, and job-pruning tests for completion delivery.

## 2. Ownership and Recoverability

- [ ] 2.1 Inject canonical `ownerRootId` immutably from the Codex bootstrap/host identity, remove owner overrides from model-facing skills/CLI, and migrate only matching legacy `job.sessionId` records.
- [ ] 2.2 Centralize trusted-root job resolution; add host-injection, model-override rejection, matching-legacy, foreign-legacy, missing-root, and operator/test override tests.
- [ ] 2.3 Move explicit read-only `--all` to a separate operator diagnostic CLI and prove it is absent from model-facing skills and cannot grant cross-owner steering, follow-up, interrupt, cancellation, wait, or inbox acknowledgement.
- [ ] 2.4 Persist the completed/interrupted/failed/cancelled recoverability matrix and its exact-session or blocking evidence in job and completion receipts.
- [ ] 2.5 Update follow-up validation to accept only explicitly resumable owner-valid sessions and add coverage for session drift, unproven failures, and cancelled jobs.

## 3. Process and Lease Cleanup

- [ ] 3.1 Make terminal publication assert Claude child/process-group exit, cleared durable identities, and released session lease; assert that the supervisor exits immediately afterward without an idle wait loop.
- [ ] 3.2 Remove every PID-only signal/liveness path, including session-conflict cleanup and stale reaping, and add missing/mismatched/reused/matching identity tests on POSIX and native-Windows code paths.
- [ ] 3.3 Add fake-Claude tests for normal completion, failure, reconnect exhaustion, interruption, cancellation, worker crash, and restart reconciliation with no unintended resident process.
- [ ] 3.4 Verify that preserving job, completion, and Claude session pointers does not keep a Claude process alive and requires no close/archive action.
- [ ] 3.5 Verify POSIX owner-only modes and native-Windows user-scoped state protection, or emit an honest protection receipt where an ACL guarantee cannot be established.

## 4. Evidence-driven Concurrency

- [ ] 4.1 Define the fixed terminal-parity workload `Reply exactly CC_CAPACITY_OK; do not use tools`, one Claude turn and 180-second timeout per job, memory/latency/failure metrics, host safety thresholds, and a stop rule for the real 1/3/6 concurrency probe.
- [ ] 4.2 Run and record the 1-job and 3-job levels, including host baseline, per-process and aggregate peak RSS, latency, failures, lease conflicts, and post-terminal cleanup.
- [ ] 4.3 Run the 6-job level only if the stop rule remains clear after level 3; otherwise record the observed unsafe boundary and stop.
- [ ] 4.4 Record the capacity decision and its evidence, including an explicit no-cap conclusion when no unsafe boundary is observed.
- [ ] 4.5 If and only if the recorded evidence establishes a justified safe bound, implement and test fail-fast admission control as a separately reviewable conditional task.

## 5. Surface and Acceptance

- [ ] 5.1 Update the old job-oriented CLI/skills just enough to expose unread completion and bounded wait while keeping canonical Agent API migration out of this change.
- [ ] 5.2 Add runtime unit/integration/e2e coverage for trusted-root isolation, operator-only `--all`, two-phase inbox delivery, recoverability, retention, platform storage protection, and resource cleanup.
- [ ] 5.3 Run `npm run check` and one real smoke with a fixed tool-free prompt (`Reply exactly CC_INBOX_OK`), one job, one Claude turn, a 120-second timeout, caller restart before inbox read, redacted receipt capture, and stop-on-first-lifecycle-failure rule.
- [ ] 5.4 After the baseline is archived, diff every MODIFIED requirement against the materialized stable spec, record the resolved requirement matrix, then run strict validation and archive before Agent Thread orchestration.
