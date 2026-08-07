## MODIFIED Requirements

### Requirement: Every terminal job emits one durable completion event
The runtime SHALL create exactly one root-owned, Agent-linked completion event when an Agent's internal job first reaches `completed`, `interrupted`, or `failed`; the event SHALL map internal `failed` to Agent `errored` and retain the complete `finalMessage`, legacy-compatible `truncated`, `detailedResultAvailable`, `claudeSessionIdAvailable`, and optional normalized `metrics` fields. New completion events SHALL preserve the complete final message without a Plugin-defined content limit and SHALL set `truncated=false`. Their metrics SHALL contain only the closed Harness-normalized provider-reported and Plugin-observed numeric vocabulary. An existing event whose content was truncated by an older runtime SHALL retain that historical provenance, and a pre-change event without metrics SHALL normalize to `metrics: null`.

#### Scenario: Worker publishes terminal state
- **WHEN** a non-terminal internal job first commits completed, interrupted, or failed state
- **THEN** an idempotently keyed completion event identifies both the internal job and stable Agent, uses the defined Agent-status mapping, and copies its normalized nullable metrics

#### Scenario: Reconciliation sees an event after a crash
- **WHEN** a terminal Agent turn exists without its deterministic completion event
- **THEN** reconciliation appends the missing Agent-linked event once with the same normalized metrics fact and without duplicating an existing event

#### Scenario: Final output exceeds the completion bound
- **WHEN** a new Agent turn's final output is larger than 64 KiB in UTF-8
- **THEN** the event retains the complete final message and records that the Plugin did not truncate it

#### Scenario: Legacy event was already truncated
- **WHEN** the runtime reads an existing event whose persisted truncation flag is true
- **THEN** it preserves that flag and stored prefix without claiming that discarded bytes were recovered

#### Scenario: Legacy event has no metrics
- **WHEN** the runtime reads a valid pre-change completion event or frozen first-delivery payload without a metrics field
- **THEN** public projection returns `metrics: null` without rewriting or recomputing that immutable historical payload

## ADDED Requirements

### Requirement: Completion metrics freeze and redeliver with the handoff
The first model-facing delivery of a new completion SHALL freeze its normalized nullable metrics under the same delivery token as status, blocking evidence, summary, and final message. Root-wide wait and targeted barrier delivery SHALL expose the identical metrics object. Reconciliation, follow-up activation, job pruning, and later provider receipts SHALL NOT mutate a frozen metrics value.

#### Scenario: Completion is delivered twice
- **WHEN** a caller does not acknowledge the first response and waits again
- **THEN** the same delivery token returns byte-equivalent metrics and completion content

#### Scenario: Targeted barrier returns multiple Agents
- **WHEN** fixed target turns settle with different partial metrics
- **THEN** each target entry carries only its own frozen nullable metrics and no aggregate price or cross-Agent inference

#### Scenario: Detailed job is pruned after completion
- **WHEN** bounded cleanup removes the internal job while its completion remains unread
- **THEN** the frozen completion metrics remain available with the durable handoff

