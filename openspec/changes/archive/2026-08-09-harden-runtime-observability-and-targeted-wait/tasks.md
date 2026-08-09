## 1. Failure and list normalization

- [x] 1.1 Extend native Claude account-limit classification for the exact session-limit signature while preserving caller-budget and generic transport behavior.
- [x] 1.2 Add positive native-error fixtures and successful-assistant-prose negatives, including public blocking projection coverage.
- [x] 1.3 Normalize exact `list_agents(path_prefix: "/root")` to the unfiltered current-root view and retain strict child-prefix validation.
- [x] 1.4 Add store and public-runtime tests for exact-root normalization and malformed/foreign prefix rejection.

## 2. Single-target progress observation

- [x] 2.1 Permit `targets + wake_on_progress` only for one target in the direct runtime and strict MCP schema.
- [x] 2.2 Extend the internal event waiter so target progress and target completion observe only the fixed snapshotted job.
- [x] 2.3 Preserve final targeted completion priority after a progress claim and keep multi-target barriers completion-only.
- [x] 2.4 Add focused tests for selected-target progress, unrelated activity isolation, completion races, one-progress budgeting, and multi-target rejection.

## 3. Operator usage and acceptance ledger

- [x] 3.1 Add a closed, owner-only append-only disposition ledger keyed by a SHA-256 delivery-token digest.
- [x] 3.2 Add a streaming fixed-window Codex rollout reader with exact `cc_for_pein` selection and global call-ID replay deduplication.
- [x] 3.3 Aggregate tool/error/wait/route/completion/redelivery/closed-metrics/disposition evidence without retaining delegated content.
- [x] 3.4 Extend the operator CLI with `record-disposition` and explicit `usage-report --all`, including reproducible `--days` and `--until` bounds.
- [x] 3.5 Add privacy, malformed-evidence, window-boundary, replay, redelivery, metric-coverage, disposition-supersession, and CLI validation tests.

## 4. Public guidance and contract checks

- [x] 4.1 Update `wait-agent` and `list-agents` Skill guidance for one-target progress and exact `/root` normalization without adding another model-facing operation.
- [x] 4.2 Document the operator commands, privacy boundary, provider-reported metric label, and no-acceptance-inference rule in README.
- [x] 4.3 Update Plugin/MCP contract tests so the seven-tool surface remains exact and single-target progress is discoverable only through the existing wait tool.

## 5. Verification and acceptance

- [x] 5.1 Run focused classifier, waiting, store, MCP, operator-ledger, and operator-CLI tests with no paid Claude invocation.
- [x] 5.2 Run strict OpenSpec validation and `npm run check` from the canonical checkout.
- [x] 5.3 Obtain an independent fixed-diff high-effort audit, disposition every finding, and rerun affected tests.
- [x] 5.4 Leave package version, Plugin cache/install state, Git history, and remote unchanged pending explicit release and push instructions.
