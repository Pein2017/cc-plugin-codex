## ADDED Requirements

### Requirement: Native-team release acceptance is explicit and paid
Before releasing the native-team capability, the checkout SHALL run exactly one
explicit real-Claude witness using a top-level `claude-opus-5` Driver turn with `low`
effort and `write: false` inside a dedicated disposable Git witness workspace,
not the source checkout. This witness SHALL invoke the same production
Driver/profile/adapter seam used by public Agents directly, not the public MCP
or detached-worker lifecycle, and SHALL claim only that narrower path. The
witness SHALL require one Haiku scout and one
Sonnet reviewer with explicit intended efforts, one current-team message,
native settle/idle evidence for both teammates, and one parent synthesis. A
witness-only in-process callback SHALL read only structured top-level
initialization/tool/team events needed to count the requested definitions,
teammate types/names, first `teammate_spawned` proof, current-team message, and
settle signals; it SHALL not
persist prompts, message text, child transcripts, session IDs, or memory
content. It SHALL verify pinned requested models from the injected definitions
and SHALL report effective teammate models, effort, and cost as unknown unless
Claude emits an authoritative structured fact. The mutation gate SHALL permit
only `.claude/agent-memory-local/haiku-scout/**` and
`.claude/agent-memory-local/sonnet/**` native-memory maintenance and SHALL fail
on any other disposable-workspace mutation, including ignored paths. The source
checkout SHALL remain unchanged. If
the production stream cannot expose a required settle/message fact, the witness
SHALL remain unverified rather than trust assistant prose. A subscription,
allowance, credit, or quota-limit response SHALL stop all subsequent paid
Claude tests and SHALL leave the capability unverified rather than failed on
model quality.

#### Scenario: Native-team capability is ready to release
- **WHEN** all zero-cost tests pass and the explicit native-team witness is authorized
- **THEN** exactly one Opus-low read-only production Driver turn in a disposable witness repository proves the observable Driver/profile/adapter Native Agent Teams path before release without claiming paid MCP/detached-worker validation

#### Scenario: Witness observes repository mutation
- **WHEN** the read-only native-team witness changes task/workspace/repository state outside the two approved native local-memory paths
- **THEN** release acceptance fails and the changed state is reported without claiming read-only enforcement

#### Scenario: Native memory directory is eagerly created
- **WHEN** Claude creates or updates only an approved teammate memory directory during the witness
- **THEN** the witness records bounded path-level mutation evidence without reading contents and does not misclassify it as task-state mutation

#### Scenario: Required native settle evidence is absent
- **WHEN** the parent finishes but structured production evidence cannot prove both teammates settled
- **THEN** release acceptance remains live-unverified even if the parent final message says the team completed

#### Scenario: Claude account limit stops the witness
- **WHEN** the witness reports an explicit subscription or quota limit
- **THEN** no further paid model test starts and release evidence records the capability as not live verified

### Requirement: Native-team paid loop is regression tested without Claude usage
The repository SHALL test the native-team paid witness control flow with a fake
Claude transport and the same witness-only in-process callback, including model definitions, cohort messages, joins, final
synthesis, ignored and non-ignored mutation checks, absent-evidence behavior,
and account-limit stop behavior, without consuming Claude quota. The fake
transport SHALL emit the same bounded structured event shape consumed from the
real stream and SHALL NOT invent production-only aggregate fields.

#### Scenario: Zero-cost team-witness regression runs
- **WHEN** the repository test suite exercises the native-team witness with fake Claude
- **THEN** it verifies the full control flow and expected failure branches without starting a real model
