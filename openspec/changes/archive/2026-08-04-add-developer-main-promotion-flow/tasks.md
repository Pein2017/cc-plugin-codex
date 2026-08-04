## 1. Promotion Contract

- [x] 1.1 Add pure checkout validation and diff-classification helpers with conservative restart-required rules.
- [x] 1.2 Add the Linux local promotion command with clean/branch/common-repository/fast-forward/check enforcement and a bounded structured receipt.
- [x] 1.3 Add the `promote:local` package command and document the fixed two-track operator flow.

## 2. Runtime Load Exclusion

- [x] 2.1 Add a bounded filesystem promotion gate for exclusive promotion and short-lived runtime loader registrations.
- [x] 2.2 Integrate loader registration around the fresh Worker module import with MCP-parent fallback cleanup.

## 3. Verification

- [x] 3.1 Add focused tests for path classification, clean/no-op/divergent promotion behavior, and exact fast-forward receipts using temporary repositories.
- [x] 3.2 Add concurrency tests proving promotion waits for active imports, new imports wait for promotion, stale absent-owner markers recover, and live markers fail closed.
- [x] 3.3 Run focused tests, lint/typecheck, the full repository check, and strict OpenSpec validation without launching a real Claude model.
