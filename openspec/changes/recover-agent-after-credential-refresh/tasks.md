## 1. Redacted Credential Observation

- [x] 1.1 Add failing tests for native OAuth presence, local expiry, malformed/missing records, API-key presence, filesystem-generation changes, and complete token/identity omission.
- [x] 1.2 Implement one checkout-owned Claude credential observer with closed versioned projections and no token or token-hash persistence.
- [x] 1.3 Integrate the observation into Claude Driver preflight and authentication-failure terminal evidence while preserving existing failure classification.

## 2. Safe Same-Agent Recovery

- [x] 2.1 Add failing Agent-runtime tests for unchanged credentials, changed current credentials, expired replacements, foreign config identities, ambiguous side effects, immutable historical completion, and blocked `send_message`.
- [x] 2.2 Add an atomic Agent-store transition that converts only the latest proven authentication block to `safe_fresh` and prevents reconciliation from resurrecting the consumed block.
- [x] 2.3 Update `followup_task` to perform the read-only credential/no-side-effect proof before mailbox mutation and then reuse the ordinary safe-fresh activation path.
- [x] 2.4 Verify legacy records without credential evidence remain readable and blocked, and concurrent/newer activations fail closed without duplicated mailbox work.

## 3. Honest Diagnostics and Guidance

- [x] 3.1 Add failing doctor tests for `liveValidated: false`, credential presence, local expiry advisory, unavailable credentials, and redaction of tokens/account identity.
- [x] 3.2 Update doctor/readiness wording and structured output so metadata-only authentication is never described as provider-live validation.
- [x] 3.3 Update follow-up Skill guidance, README, and Plugin contract tests to explain credential-refresh recovery without adding a tool or new public input.

## 4. Verification and Release Preparation

- [x] 4.1 Run the focused credential, Driver, Agent recovery, completion, diagnostics, and Plugin contract test suites and resolve all failures.
- [ ] 4.2 Run one explicit Haiku/low real Claude smoke through the fixed config/proxy path; stop paid Claude testing if account-limit evidence appears.
- [x] 4.3 Update `CHANGELOG.md` and the package base version from the single version source for the release.
- [ ] 4.4 Run `npm run check`, strict OpenSpec validation, local Plugin validation, zero-cost release smoke, doctor, and readiness with no P0/P1 gaps.
