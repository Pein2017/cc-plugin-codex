## Why

Recent fixed-window usage evidence shows that CC completion delivery is usually productive, but four operator-facing gaps still create avoidable recovery or orchestration friction: native Claude session-limit failures can be misclassified as retryable Agent failures, a lead cannot intentionally observe progress for one exact target, `/root` is rejected as a harmless list alias, and runtime metrics are not connected to a lead-owned acceptance outcome. These are narrow contract gaps that can be closed without expanding the seven-tool model-facing surface or changing the release lifecycle.

## What Changes

- Classify an explicit native Claude `You've hit your session limit` failure as `usage_or_subscription_limit`, so the public blocking receipt becomes `account_limit / harness / operator_required` and does not suggest a fresh Agent retry.
- Permit `wait_agent` to combine `wake_on_progress: true` with exactly one target while preserving completion-first delivery, one-update progress budgeting, durable acknowledgement, and completion-only multi-target barriers.
- Treat `list_agents(path_prefix: "/root")` as the current-root unfiltered view; continue rejecting foreign or malformed prefixes.
- Add an operator-only, append-only acceptance-disposition ledger and seven-day usage report. The report deduplicates replayed Codex MCP events, excludes prompt/final-message content, joins provider-reported runtime metrics when available, and distinguishes `accepted_first_pass`, `accepted_after_correction`, `rejected_or_escalated`, `surface_failure`, and `unknown`.
- Keep the current seven model-facing tools unchanged. Do not add automatic acceptance inference, implicit completion acknowledgement, final-message truncation, price estimation, task wakeup after the Codex task has ended, or release/install behavior.

## Capabilities

### New Capabilities

- `operator-usage-ledger`: Defines the operator-only acceptance-disposition record and privacy-preserving fixed-window CC usage report.

### Modified Capabilities

- `claude-session-execution`: Recognize the native Claude session-limit failure signature without classifying ordinary assistant prose that merely discusses limits.
- `canonical-agent-orchestration`: Allow single-target progress observation and normalize the exact `/root` list prefix to the current-root unfiltered view.
- `agent-progress-delivery`: Scope an opt-in targeted progress wake to the named Agent while retaining completion priority and the existing one-update budget.
- `typed-mcp-orchestration`: Accept the single-target progress combination while continuing to reject progress-enabled multi-target barriers.

## Impact

- Runtime classification, blocking projection, Agent waiting, listing, operator CLI/reporting, and durable operator data.
- The `wait_agent` and `list_agents` Skills, README operator documentation, and focused runtime/MCP/CLI tests.
- No new runtime dependency, no model-facing tool count change, no version bump, no installation refresh, and no remote operation in this change.
- Lifecycle ordering: `add-targeted-barrier-agent-join` owns the base targeted-join contract and must be synced/archived before this change is archived; this change extends that implemented behavior rather than defining a second target-join owner.
