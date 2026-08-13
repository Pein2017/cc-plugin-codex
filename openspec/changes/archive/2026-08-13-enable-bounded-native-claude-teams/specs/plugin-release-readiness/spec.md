## ADDED Requirements

### Requirement: Native-team release acceptance is explicit and paid
Before releasing the native-team capability, the checkout SHALL run at most one
explicit real-Claude witness per user authorization, with no automatic paid
retry. The acceptance witness SHALL use a top-level `claude-opus-5` Driver turn with `low`
effort and `write: false` inside a dedicated disposable Git witness workspace,
not the source checkout. This witness SHALL invoke the same production
Driver/profile/adapter seam used by public Agents directly, not the public MCP
or detached-worker lifecycle, and SHALL claim only that narrower path. The
witness SHALL require one Haiku scout and one
Sonnet reviewer with explicit intended efforts, one current-team message,
and one successful parent synthesis. For Claude 2.1.227, teammate settle/idle
SHALL be reported as unobservable because native delivery is mailbox- and
optional-hook-based rather than a stable top-level stream event; the witness
SHALL NOT invent `system/teammate_*` events or claim the parent terminal proves
each teammate settled. A
witness-only in-process callback SHALL read only structured top-level
initialization/tool/team events needed to count the requested definitions,
teammate types/names, correlated asynchronous launches, successful validated
current-team transport, and
successful parent terminal synthesis; it SHALL not
persist prompts, message text, child transcripts, session IDs, or memory
content. It SHALL verify pinned requested models from the injected definitions
and SHALL report effective teammate models, effort, and cost as unknown unless
Claude emits an authoritative structured fact. The mutation gate SHALL permit
only `.claude/agent-memory-local/haiku-scout/**` and
`.claude/agent-memory-local/sonnet/**` native-memory maintenance and SHALL fail
on any other disposable-workspace mutation, including ignored paths. The source
checkout SHALL remain unchanged. If the production stream cannot expose a
required definition/spawn/message/terminal fact, the witness SHALL remain
unverified rather than trust assistant prose. A subscription,
allowance, credit, or quota-limit response SHALL stop all subsequent paid
Claude tests and SHALL leave the capability unverified rather than failed on
model quality.

#### Scenario: Native-team capability is ready to release
- **WHEN** all zero-cost tests pass and an explicit native-team witness is authorized
- **THEN** that authorization starts at most one Opus-low read-only production Driver turn in a disposable witness repository to prove the observable Driver/profile/adapter Native Agent Teams path before release without claiming paid MCP/detached-worker validation

#### Scenario: Witness observes repository mutation
- **WHEN** the read-only native-team witness changes task/workspace/repository state outside the two approved native local-memory paths
- **THEN** release acceptance fails and the changed state is reported without claiming read-only enforcement

#### Scenario: Native memory directory is eagerly created
- **WHEN** Claude creates or updates only an approved teammate memory directory during the witness
- **THEN** the witness records bounded path-level mutation evidence without reading contents and does not misclassify it as task-state mutation

#### Scenario: Native settle evidence is not a top-level stream fact
- **WHEN** the exact executable exposes teammate idle/completion only through native mailbox delivery or optional hooks
- **THEN** the witness reports settle as unobservable, does not invent a fake event, and scopes acceptance to the narrower observable path without claiming each teammate settled

#### Scenario: Claude account limit stops the witness
- **WHEN** the witness reports an explicit subscription or quota limit
- **THEN** no further paid model test starts and release evidence records the capability as not live verified

#### Scenario: Adapter vocabulary causes an observer false negative
- **WHEN** one authorized paid turn contains the required closed structured launch, named-message, and parent-terminal facts but the then-current Adapter rejects them because it expected an obsolete upstream status token
- **THEN** acceptance remains closed until the original false report is preserved, the raw-status translation is corrected test-first at the Adapter boundary, and a sanitized replay of those exact fact shapes passes through the production Adapter/witness controller; that same paid turn MAY then satisfy the live-path evidence without an automatic paid retry or reliance on assistant prose

### Requirement: Native-team paid loop is regression tested without Claude usage
The repository SHALL test the native-team paid witness control flow with a fake
Claude transport and the same witness-only in-process callback, including model definitions, cohort messages, the explicit unobservable-settle boundary, final
synthesis, ignored and non-ignored mutation checks, absent-evidence behavior,
and account-limit stop behavior, without consuming Claude quota. The fake
transport SHALL emit the same bounded structured event shape consumed from the
real stream and SHALL NOT invent production-only aggregate fields.

#### Scenario: Zero-cost team-witness regression runs
- **WHEN** the repository test suite exercises the native-team witness with fake Claude
- **THEN** it verifies the full control flow and expected failure branches without starting a real model
