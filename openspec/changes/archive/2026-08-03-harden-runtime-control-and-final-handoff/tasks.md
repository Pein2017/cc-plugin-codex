## 1. Process Ownership And Control

- [x] 1.1 Make verified worker-or-child residency the shared source for stale-job reaping and Claude session lease admission.
- [x] 1.2 Classify Linux process-group probe and signal outcomes so only `ESRCH` is treated as absence.
- [x] 1.3 Add synchronized-child-exit/live-worker and non-`ESRCH` signal regression tests.

## 2. Claude Handoff And Failure Evidence

- [x] 2.1 Track top-level Claude assistant message boundaries and select only the latest complete message for untruncated `finalMessage`.
- [x] 2.2 Restrict Harness-scoped failure classification to native terminal, stderr, warning, exit, and structured API evidence.
- [x] 2.3 Bound persisted tool activity without storing arbitrary tool-input values and add multi-message, false-classification, and oversized-input tests.

## 3. Runtime Privacy And Recovery Contracts

- [x] 3.1 Enforce owner-only modes for Plugin-owned runtime directories and job logs, including safe correction on open.
- [x] 3.2 Redact private session IDs, job IDs, and runtime paths from model-facing MCP errors while preserving actionable categories.
- [x] 3.3 Validate persisted blocking reason, scope, and retry combinations and add invalid-tuple regression tests.
- [x] 3.4 Rebuild compatibility shells from an explicit discovery-file whitelist and prove unrelated old-cache files are not copied.

## 4. Public Guidance And Release Smoke

- [x] 4.1 Update completion-token acknowledgement, activation-pending, and fixed-wait guidance across MCP descriptions, Skills, and operator documentation.
- [x] 4.2 Repair the optional Haiku/low paid smoke to use the current `wait_agent` schema and cover its real control flow with a zero-Claude fake transport.

## 5. Verification

- [x] 5.1 Run focused zero-Claude regression tests and strict OpenSpec validation.
- [x] 5.2 Run one checkout-owned Haiku/low real smoke unless account or authentication evidence requires stopping model tests.
- [x] 5.3 Run `npm run check` and reconcile an independent read-only fixed-tree review.
