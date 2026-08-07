## Context

See `proposal.md` for motivation. The released runtime already has two separate
safe evidence streams: durable Agent/job lifecycle facts and a sanitized
`publicProgress` revision. It also retains raw bounded Claude terminal events
inside internal job receipts for failure classification, but neither stream is
currently normalized into a compact Agent Card or usage handoff.

The public lifecycle remains exactly seven operations. `runtime/index.mjs` is
the sole lifecycle interface, completion delivery is at-least-once with frozen
payloads, and model-facing calls are scoped by trusted Codex root metadata.

## Goals / Non-Goals

**Goals:**

- Make an explicit spawn/list observation answer model, effort, behavioral
  authority, phase, and timing questions from retained facts.
- Preserve exact provider-reported numeric metrics and small Plugin counters
  across completion, restart, barrier, and pruning.
- Keep public evidence bounded, nullable, backwards compatible, and clearly
  separated from operator-only receipts.
- Reduce always-visible MCP instruction duplication without weakening policy.

**Non-Goals:**

- No liveness detector, heartbeat, task/command parser, file census, billing
  estimator, verdict parser, automatic wakeup, lifecycle action, or new tool.
- No change to progress eligibility, targeted barrier completion semantics,
  completion acknowledgement, owner-root isolation, or process permission.

## Decisions

### Derive Agent Cards from the current Agent plus its concrete retained job

One helper builds both spawn and list projections. Stable Agent facts provide
name, selected model, delegation mode, and lifecycle. The retained active or
latest job provides request effort/write, `startedAt`, terminal time,
`result.lastByteAt`, and `publicProgress`. No new Agent-registry fields are
added merely to keep observability after detailed-job pruning; absence is
represented honestly by `null`.

Authority uses the closed values `behavioral_read_only`, `behavioral_write`,
and `unknown`. The last value is permitted only when no retained request proves
the latest turn's write intent. This keeps the existing `write` input stable
while preventing UI prose from implying an OS sandbox.

Safe card phase is derived from admitted public activity only:
`initialized -> starting`, `tool -> tool`, `thinking -> thinking`,
`responding -> responding`, `retrying -> retrying`, and
`reconnecting -> reconnecting`. Hook activity and unknown activity become
`null`. Terminal Agent state does not invent `synthesizing`, `blocked`, or
`needs-input`. When a safe public phase is admitted, `last_activity_at` prefers
the validated Driver `lastByteAt`, then validated public-progress time; without
that phase it stays `null`. It is an observation timestamp, never a heartbeat.

`elapsed_seconds` is a non-negative whole-second query-time projection from
job start to terminal completion or current clock. It is not persisted and
does not participate in completion equality, acknowledgement, or recovery.

Alternative rejected: persist a rich Agent Card in the registry. That creates
a second mutable lifecycle owner and migration burden for information already
owned by the job. Alternative rejected: expose progress summary/revision in
list. That would turn logical listing into a second progress-delivery channel.

### Normalize metrics at the Claude parser and validate them again at Driver boundary

The stream parser extracts the latest terminal result into a pure nullable
version-one metrics object. It accepts only known numeric fields and never
copies the raw `usage` object. Counts/durations require non-negative safe
integers; cost requires a non-negative finite number. A second Harness-neutral
validator closes the shape before the Driver result enters the supervisor.

The shape separates provenance:

```json
{
  "version": 1,
  "provider_reported": {
    "duration_ms": null,
    "duration_api_ms": null,
    "turn_count": null,
    "input_tokens": null,
    "output_tokens": null,
    "cache_creation_input_tokens": null,
    "cache_read_input_tokens": null,
    "reported_cost_usd": null
  },
  "plugin_observed": {
    "tool_call_count": 0,
    "attempt_count": 1,
    "recovery_attempt_count": 0
  }
}
```

Nullable provider keys stay explicit so consumers can compare partial receipts
without treating omitted fields as zero. `metrics` itself is `null` only when
neither provider nor Plugin evidence exists; normal executed turns therefore
usually have Plugin-observed counters even when Claude reports no usage.

Provider fields describe the final native attempt after a bounded reconnect;
they are not summed into a Plugin-authored provider aggregate. Plugin counters
are computed after all bounded recovery attempts are collected.
Tool-call count counts retained tool-use receipts, not unique tool names. It is
not a command count or proof of file mutation.

Alternative rejected: calculate cost from a local price table. Subscription
billing and model pricing are external, mutable policy and `total_cost_usd`
cannot be relabeled as an actual charge. Alternative rejected: expose all
native usage keys for forward compatibility. That converts protocol drift into
an unbounded public payload and leaks provider-specific text.

### Carry metrics as part of the immutable completion fact

The Harness-neutral turn result, internal terminal job result, normalized
completion event, first-delivery payload, root-wide completion, and each
targeted settled entry carry the same metrics object. Completion equality
includes structural metrics equality before first delivery. Once frozen, old
and new payloads redeliver byte-identically. Version-one or already-frozen
payloads without metrics normalize to `null` and are never backfilled.

This extends an existing durable fact rather than creating a separate usage
ledger. Parent acceptance/disposition and cross-Agent cost analysis remain
outside this Plugin.

### Compress instruction ownership rather than add a high-level operation

The MCP server instruction owns common asynchronous-spawn and join policy.
Tool descriptions keep only operation-specific constraints. On-demand Skills
retain the full safety/recovery explanation and concise presentation rules.
Contract tests assert semantic markers and a tighter combined word/character
budget rather than exact prose.

No `delegate` wrapper is added: join timing remains a lead decision, and a
single call cannot keep an ended Codex turn alive.

## Risks / Trade-offs

- [Claude changes terminal usage shape] -> unknown or mistyped fields become
  absent, bounded protocol-drift evidence remains operator-only, and fixtures
  cover partial/invalid events.
- [Dynamic elapsed values make snapshots non-identical] -> elapsed exists only
  in Agent Cards, never completion facts, and tests inject or bound the clock.
- [List becomes a polling temptation] -> it exposes no summary/revision and
  Skills continue to prohibit list-as-completion/progress polling.
- [Detailed job pruning loses turn metadata] -> stable Agent fields remain and
  nullable card fields explicitly report unknown; no second registry owner is
  introduced.
- [Additive receipt fields surprise stale instructions] -> MCP input schemas
  remain compatible, but Skill/descriptor acceptance requires local refresh and
  a new Codex task; promotion classifies the actual diff accordingly.
- [Raw terminal events contain private provider data] -> metrics are selected
  into a closed numeric object before public projection; raw events stay
  internal and bounded.

## Migration Plan

1. Add pure metrics/card helpers and fixtures without changing public output.
2. Propagate normalized metrics through Driver, supervisor, job, and completion
   storage with legacy-null compatibility.
3. Switch spawn/list/wait/barrier projections and update model guidance.
4. Run focused tests, full `npm run check`, strict OpenSpec validation, and an
   independent fixed-tree audit.
5. Leave the verified result on `developer`; promotion, refresh, release, and a
   new Codex task require separate authorization.

Rollback removes additive projection fields while retaining unknown metrics in
newer durable records as ignored fields. Frozen completion payloads already
delivered by the newer runtime remain immutable evidence and must not be
rewritten by rollback.
