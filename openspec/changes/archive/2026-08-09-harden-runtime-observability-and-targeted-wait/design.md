## Context

See [proposal.md](./proposal.md) for motivation. The targeted barrier implementation already exists in the checkout under the still-active `add-targeted-barrier-agent-join` change. Current targeted waits deliberately suppress progress, the internal waiter's final progress/completion race recheck is root-wide, and the MCP schema rejects every `targets + wake_on_progress` combination. Claude failure classification already excludes assistant `finalMessage` and derives blocking from native failure evidence, but its explicit account-limit expression misses the native phrase `You've hit your session limit`.

Operator diagnostics currently expose only cross-root Agent listing. Codex rollout JSONL already contains the authoritative host-side `mcp_tool_call_end` evidence needed to measure CC orchestration calls, errors, wait outcomes, replayed call IDs, routes selected at spawn, completion redelivery, and the closed metrics carried by completion receipts. The runtime must not duplicate prompts, final messages, or raw session evidence into another analytics store.

## Goals / Non-Goals

**Goals:**

- Close the exact session-limit misclassification without broadening text heuristics into successful Claude prose.
- Extend the implemented fixed targeted-join snapshot with one intentional, target-scoped advisory progress wake.
- Add reproducible operator evidence for seven-day CC usage and lead-owned acceptance outcomes.
- Keep persistence, root isolation, delivery tokens, and the seven-tool model-facing surface unchanged.

**Non-Goals:**

- Inferring acceptance, attributing a correction to a specific follow-up automatically, estimating billed cost, or ranking models.
- Persisting a second copy of terminal jobs or making analytics part of job completion/pruning.
- Returning multiple progress updates, progress-enabled multi-target barriers, implicit completion acknowledgement, or post-task host wakeup.
- Versioning, installation refresh, commit, push, or archival of prerequisite OpenSpec changes.

## Decisions

### Match the native session-limit signature only inside admitted failure evidence

Add a narrow account-capacity expression for `hit/reached/exceeded your session limit` to the existing native failure text classifier. The existing evidence assembly remains unchanged: stderr, runtime warning, terminal `error`/`errors`, and failed terminal result text are admitted; successful assistant handoff text is not. Caller-imposed `--max-budget-usd` continues to take precedence as an exclusion.

Alternative considered: classify every occurrence of `session limit` in the completed result. Rejected because a reviewer can discuss that phrase in ordinary prose and because `Harness failure classification uses native execution evidence` is already a correctness boundary.

### Treat single-target progress as an observation of the fixed job snapshot

Public validation permits `wake_on_progress` with `targets` only at width one. Target resolution still snapshots `activeJobId ?? latestJobId` once at call entry. The internal waiter receives that exact job both as its targeted completion set and its only eligible progress job.

The waiter gains a targeted-progress mode with these rules:

1. Read only completion evidence for the selected target job.
2. If it is not terminal, select progress only from that same job.
3. Immediately re-read only that target's completion evidence before claiming progress.
4. After reconciliation, take the existing zero-time completion-only observation against the same target before returning a claimed progress update.
5. If completion is present, project the existing one-target aggregate receipt; otherwise return the existing bounded progress update shape.

Unrelated root completions therefore neither resolve nor block targeted progress and remain unread. Width-two-or-more barriers remain completion-only and retain their all-settled, no-partial-payload behavior.

Alternative considered: run an untargeted progress wait and filter the returned Agent afterward. Rejected because it would consume another Agent's one-progress budget and could freeze or return unrelated completion evidence.

### Normalize `/root` at the Agent-store filter owner

The store maps an exact trimmed `/root` prefix to no prefix before validating child prefixes. This makes direct runtime, MCP, and store callers consistent while preserving `/root/...` validation and current-root registry isolation.

Alternative considered: normalize only in the MCP adapter. Rejected because direct runtime/operator tests would retain a different contract.

### Keep acceptance state tiny, append-only, and independent of runtime lifecycle

Add one owner-only JSONL ledger under the checkout-independent Plugin data root. Each record contains only a schema version, SHA-256 digest of the opaque completion delivery token, one closed operator disposition, and an operator timestamp. The token itself, Agent/session/job/root identity, workspace, notes, prompts, messages, and metrics are not stored. A later valid record for the same digest supersedes it during reporting; the history remains append-only. No disposition means `unknown`; `unknown` is not an operator-set outcome.

The operator command is:

```text
node runtime/operator-cli.mjs record-disposition \
  --delivery-token <opaque-token> \
  --disposition <accepted_first_pass|accepted_after_correction|rejected_or_escalated|surface_failure>
```

Alternative considered: persist one usage row per terminal job before pruning. Rejected for this change because it cannot measure wait/list/schema-error/redelivery behavior from Codex, makes analytics part of job lifecycle correctness, and introduces a second terminal projection that would require backfill and pruning gates.

### Build the report from exact Codex MCP completion events

`usage-report --all` enumerates `$CODEX_HOME/sessions/**/*.jsonl` in deterministic oldest-path-first order, indexes the owning session and direct-parent IDs from the first metadata record, and scans every retained file as a streaming read. A non-empty `call_id` is reserved globally before the UTC window is applied. This matters because Codex fork materialization copies parent events and rewrites their outer timestamps: the canonical historical occurrence must suppress its later copy even when the canonical event is outside the report window. The report then selects only `event_msg` rows whose payload is `mcp_tool_call_end` and whose invocation server is exactly `cc_for_pein`. A no-ID row in a primary rollout is counted separately and cannot be proven replay-safe. A no-ID row in a fork, or every row in a fork whose direct parent is no longer retained, fails closed because imported parent history cannot be distinguished from child-native work; the diagnostics expose both unresolved files and records.

The default window is the preceding seven 24-hour periods, represented as `[start, end)` in UTC. `--days` and `--until` exist only for reproducible operator reports. The report aggregates:

- completed call and explicit error counts per canonical tool;
- wait completion/progress/timeout/barrier/error outcomes;
- spawn model, effort, delegation mode, and write selections;
- unique delivery tokens, redelivery count, terminal statuses, and latest explicit disposition;
- closed provider-reported and plugin-observed metrics once per unique delivery token, with per-field coverage.

The parser uses structured MCP content when present and otherwise parses the JSON text result. It extracts admitted fields and immediately discards task arguments, completion messages, arbitrary output, and raw records. Provider `reported_cost_usd` remains labeled provider-reported; missing fields remain missing rather than zero.

Alternative considered: reuse the external `codex-usage-ledger` skill or the one-off audit script. Rejected because the repository's operator command must be checkout-owned, testable, dependency-free, and available without a separate skill installation.

## Risks / Trade-offs

- **Codex rollout schema can drift** → Match a narrow version-one evidence shape, count malformed/unrecognized rows, keep the command operator-only, and add fixture tests. Never reinterpret another namespace as CC.
- **A large final message makes one JSONL row large** → Stream files line-by-line, retain only aggregates, and never copy the message into the report or disposition ledger.
- **JSONL append can be interrupted** → Append one bounded record per operation with owner-only permissions; readers reject malformed lines as acceptance evidence and expose a malformed counter.
- **Two operators can append conflicting dispositions** → Append-only latest-valid-record-wins semantics make ordering explicit; report timestamps and record order resolve the current value without erasing history.
- **Target completion can race a progress claim** → Reuse observe-register-observe plus the final zero-time targeted completion check; completion remains authoritative and claimed progress is not redelivered.
- **Two active OpenSpec changes modify targeted wait** → Archive/sync `add-targeted-barrier-agent-join` first, then validate and archive this change. Implementation tests cover the composed checkout state now.

## Migration Plan

1. Land the narrow runtime, operator CLI, documentation, and tests without changing the package version or installed Plugin snapshot.
2. Existing completion/session/job data remains valid; the disposition ledger is created lazily on first operator record.
3. Existing MCP processes keep the old schema until a later explicit release/refresh and new Codex task. Runtime-only compatible fixes can be exercised directly in checkout tests meanwhile.
4. Rollback removes the new operator module/commands and restores the prior validation branches; no runtime Agent state migration is needed. The optional disposition ledger may remain inert and contains no raw token or delegated content.
