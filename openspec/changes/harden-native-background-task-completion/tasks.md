## 1. Add Safe Protocol-Drift Evidence

- [x] 1.1 Add bounded parser/Driver receipt fields for unknown top-level event type, safe subtype, and count while discarding arbitrary payload values.
- [x] 1.2 Add fixtures proving large unknown payloads, hook bodies, prompts, tool inputs, proxy values, credentials, and session content cannot enter the persisted summary.
- [x] 1.3 Prove unknown metadata alone does not change the existing process-close plus terminal-result completion classification.

## 2. Run The Headless Background Lifecycle Spike

- [ ] 2.1 Build an isolated temporary-Git probe that records the admitted Claude executable fingerprint/version, raw stream-json, process/result timing, and probe-owned marker outcomes without modifying the repository under test.
- [ ] 2.2 Run the foreground control, tracked-background, and streaming-stdin-held-open cases once with `claude-haiku-4-5`/low under the fixed terminal-parity environment; stop all remaining real Claude calls on explicit account/subscription/usage/credit/allowance/quota exhaustion. **Blocked 2026-08-04 before probe:** the exact-tree Claude audit route returned `401 OAuth access token has expired` with `operator_required`; this workflow made no further real Claude calls or model substitution.
- [ ] 2.3 Write a sanitized `research/claude-headless-background-task-lifecycle.md` that separates observed event shapes and process facts from inferences and states whether stable task identity, terminal notification, reinvocation, and detachment evidence exist.

## 3. Enforce The Evidence Gate

- [ ] 3.1 Compare the probe result with this design and specs before changing terminal behavior; if stable lifecycle evidence is absent, stop after diagnostics and tests rather than inventing process supervision.
- [ ] 3.2 If the observed ordering requires a new public status, blocking reason, MCP schema, or a Plugin-owned lifecycle beyond the approved envelope, pause implementation, update the OpenSpec coherently, and obtain the user's architectural decision.
- [ ] 3.3 Freeze only the observed closed task-event state machine and exact compatibility boundary used by fixtures; do not generalize from unobserved interactive Claude behavior.

## 4. Implement Only The Proven Native Lifecycle

- [ ] 4.1 Teach the Claude adapter to recognize the evidenced task start, ownership/detachment, and terminal transitions under strict bounded parsing.
- [ ] 4.2 Make the Claude Driver refuse normalized `completed` when recognized must-join work remains open or task evidence is contradictory, using the existing Harness incompatibility path unless an approved spec revision says otherwise.
- [ ] 4.3 If and only if the probe proves a supported post-result reinvocation while the process remains owned, keep the job active through that native boundary; never fabricate `working` after the child process exits.
- [ ] 4.4 Preserve final-message selection, exact-session continuation, transport recovery, interruption, Fable native delegation, Auto Memory, and prompt-level authority behavior.

## 5. Verify Compatibility And Failure Semantics

- [ ] 5.1 Add exact adapter and Driver fixtures for every observed ordering, including result-before-task-terminal, task-terminal-before-result, detached work, duplicate/unknown task identity, process close with open work, and clean foreground completion where applicable.
- [ ] 5.2 Add supervisor integration tests proving contradictory native evidence cannot publish a successful Agent completion and that assistant prose never changes lifecycle state.
- [ ] 5.3 Run Claude version-compatibility, adapter, Driver, supervisor, completion, and plugin contract tests plus `npm run check`; run no second real Claude matrix unless the first evidence is inconclusive for a specific approved case.

## 6. Routed Independent Review And Lead Acceptance

- [ ] 6.1 Use the raw Haiku/low receipt only as mechanical protocol evidence; the Codex lead owns interpretation and fixes the implementation contract before assigning a writer.
- [ ] 6.2 Route one Codex builder over the adapter/Driver seam, preferring live Luna high/xhigh behind captured fixtures and using Terra/high only for a demonstrated integration mismatch; do not admit a competing writer.
- [ ] 6.3 Bind a fresh Claude Opus/high read-only review to the exact post-test tree for false completion, payload leakage, incompatible-version handling, orphan-process claims, and final-message regressions.
- [ ] 6.4 Let the Codex lead disposition findings, rerun affected gates, classify the result as hot-compatible or restart-required from the actual public diff, and record a concise route evaluation without turning one task into a permanent model ranking.
