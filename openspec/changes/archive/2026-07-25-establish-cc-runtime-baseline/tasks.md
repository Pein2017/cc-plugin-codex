## 1. Baseline Traceability

- [x] 1.1 Record commit `5303a35` and map every baseline requirement to its owning runtime module and focused automated test.
- [x] 1.2 Compare the public `runtime/index.mjs`, checkout bootstrap, plugin skill snapshot, README, and CLI help against the four capability specs; record any mismatch without changing runtime behavior in this change.
- [x] 1.3 Confirm that plugin cleanup targets only retained job state/logs and does not target Claude artifacts under `CLAUDE_CONFIG_DIR`.
- [x] 1.4 Capture the current PID-only internal conflict-cleanup and stale-reaper paths as named hardening gaps while confirming that user-facing interrupt/cancel rejects missing or mismatched identities.

## 2. Baseline Verification

- [x] 2.1 Run the environment, execution-profile, Claude adapter, job-store, supervisor, and runtime integration tests that cover the specified baseline behavior.
- [x] 2.2 Run `npm run check` and retain the exact test/build receipt as baseline evidence.
- [x] 2.3 Run one bounded real terminal-parity smoke: initial prompt `Reply exactly CC_BASELINE_OK` and follow-up `Reply exactly CC_FOLLOWUP_OK`, no requested tools, one Claude turn per request, 120-second timeout each, stop on first mismatch, and retain session-capture/redaction plus on-disk artifact receipts without modifying the repository.
- [x] 2.4 Classify every discovered discrepancy as a documentation correction to this baseline or a concrete task for `harden-runtime-foundations`; do not silently implement later lifecycle behavior.

## 3. OpenSpec Baseline Promotion

- [x] 3.1 Validate `establish-cc-runtime-baseline` with strict OpenSpec checks.
- [x] 3.2 Sync the four baseline capability specs into repo-local `openspec/specs/` and verify that the planning root remains this checkout.
- [x] 3.3 Archive the completed baseline change before applying either dependent change.
