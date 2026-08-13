# claude-version-compatibility Specification

## Purpose

Define zero-model-cost detection and admission of independently updated host
Claude Code executables.
## Requirements
### Requirement: Claude executable drift is checked without a model call
Readiness SHALL fingerprint the configured Claude executable using its canonical
target, filesystem identity, and normalized version output. For a previously
unseen fingerprint it SHALL run a zero-model-cost static check of the CLI flags
and value vocabulary required by the current runtime, sample the executable
again, and persist the result. It SHALL NOT invoke a Claude model as part of
automatic readiness.

#### Scenario: Known executable is unchanged
- **WHEN** readiness observes the same fingerprint as the cached static result
- **THEN** it reuses that result without running another `--help` probe or model call

#### Scenario: Claude Code updates in place
- **WHEN** the configured path remains the same but version or filesystem identity changes
- **THEN** readiness treats it as a new fingerprint and runs the static check

#### Scenario: Executable changes during the probe
- **WHEN** the fingerprint sampled after `--help` differs from the admitted sample
- **THEN** readiness records an unstable incompatible observation and launches no Agent

### Requirement: Required CLI surface gates new activation
The static check SHALL require every option and value vocabulary emitted by the
current terminal-parity and safe profiles, including
`--append-system-prompt`, `--disallowedTools`, and `--agents`. A missing option,
failed or timed-out probe, or unstable executable fingerprint SHALL make
readiness false and SHALL fail before a new Agent, job, or idle follow-up
activation is durably published. The check SHALL NOT pin a semantic-version
range or fall back to another executable, model, or effort. Static admission
SHALL NOT claim that native-team behavior or per-invocation effort was live
validated.

#### Scenario: Required flag is missing
- **WHEN** the new Claude CLI help omits a flag emitted by the runtime
- **THEN** readiness reports the version, executable, missing surface, and incompatibility without launching Claude

#### Scenario: Native team definition flag is missing
- **WHEN** Claude CLI help omits `--agents`
- **THEN** every new public activation fails before state mutation because the executable cannot reproduce the orchestrator profile

#### Scenario: Delegation policy flag is missing
- **WHEN** Claude CLI help omits `--append-system-prompt`, `--disallowedTools`, or `--agents`
- **THEN** every new public activation fails before state mutation because the runtime cannot reproduce its delegation boundary

#### Scenario: Compatible frontier version appears
- **WHEN** a previously unseen version advertises the complete required surface and stays stable through the probe
- **THEN** readiness admits it as statically compatible and live-unverified without requiring a repository change

#### Scenario: Active turn receives steering after an update
- **WHEN** a Claude process is already active and a message is delivered to that process
- **THEN** the message does not require readiness for a different not-yet-launched executable

### Requirement: Compatibility evidence is durable and bounded
The runtime SHALL persist one current compatibility observation, the last
statically compatible observation, and the last successfully completed
production-path turn observation in owner-only workspace state. New incompatible
evidence SHALL replace the current observation without erasing the previous
known-compatible or successful evidence. Receipts SHALL expose only bounded
version, executable, status, timestamp, fingerprint, required-surface revision,
missing-surface, and fixed failure-code fields. Raw command stdout, stderr, and
error details SHALL NOT be persisted or exposed as compatibility evidence.

#### Scenario: Static probe succeeds
- **WHEN** a new fingerprint passes the static check
- **THEN** current and last-statically-compatible evidence identify that fingerprint while runtime status remains live-unverified

#### Scenario: Later probe fails
- **WHEN** a later fingerprint is incompatible
- **THEN** current evidence records the failure and prior compatible and successful evidence remain available for diagnosis

#### Scenario: Ordinary requested turn succeeds
- **WHEN** a turn completes, its runtime-reported Claude version matches, and a post-turn executable resample exactly matches its prepared fingerprint
- **THEN** that fingerprint becomes the last successfully observed working version without any extra model call

#### Scenario: Executable is replaced during an active turn
- **WHEN** a turn completes but the post-turn executable fingerprint differs from its prepared fingerprint, even if the reported version is unchanged
- **THEN** the runtime does not record that fingerprint as successfully observed working

### Requirement: Detached launch revalidates prepared compatibility
Each prepared job SHALL retain the admitted fingerprint and executable. The
detached worker SHALL run a zero-model-cost revalidation before process launch,
SHALL spawn the admitted absolute executable, and SHALL fail pre-Claude if the
fingerprint changed after preparation. Existing active processes and prior
session history SHALL NOT be terminated or rewritten by version drift.

#### Scenario: Binary changes after readiness
- **WHEN** the worker observes a different fingerprint from the prepared job
- **THEN** it starts no Claude child, sends no prompt, and retains safe-fresh or exact-session continuation evidence for a later retry

#### Scenario: Exact session continues on a compatible update
- **WHEN** a later activation is prepared against a newly compatible fingerprint and owns an exact Claude session ID
- **THEN** it may resume that same session while recording the new turn's Claude version separately

### Requirement: Operator compatibility diagnosis is zero-model and non-persistent
Doctor SHALL reuse the required Claude option/value vocabulary and executable fingerprinting semantics to run a static compatibility diagnosis without invoking a model or persisting Agent readiness evidence. Its result SHALL contain only normalized version, compatibility status, bounded missing surface, and fixed failure code.

#### Scenario: Updated Claude remains compatible
- **WHEN** doctor inspects a newly updated executable that advertises the required surface and remains stable through the probe
- **THEN** it reports static compatibility without creating a job, Agent, completion event, or compatibility-state record

#### Scenario: Updated Claude drops a required flag
- **WHEN** doctor observes a missing required CLI flag or value
- **THEN** it fails the compatibility check with bounded missing-surface evidence and launches no model

### Requirement: Observable production initialization validates the reviewed native surface
When a production Claude initialization event supplies native tool and Agent
inventories, the runtime SHALL canonicalize the init tool alias `Task` to policy
name `Agent`, compare the result with the reviewed deny contract for its mode,
and verify that an orchestrator inventory contains `haiku-scout`, `sonnet`, and
`opus` plus the necessary coordination tool names. Those names SHALL be a
necessary precondition, not proof that the Agent Teams server gate is active.
A forbidden tool or missing orchestrator definition/necessary tool SHALL terminate the turn as an
actionable Harness compatibility failure. A leaf initialization without an
inventory SHALL NOT be treated as proof and MAY continue as
`denySetLiveValidated: false`; an orchestrator without the inventories required
to prove its injected native team SHALL fail rather than fall back. Unknown
non-forbidden native tools SHALL be bounded advisory drift and SHALL NOT by
themselves block the turn. Names under reviewed extension namespaces such as
`mcp__*` SHALL not be misclassified as new native built-ins. The scoped
`denySetLiveValidated` result SHALL claim only that the reviewed deny set was
observed clean, never universal containment. Evidence SHALL contain names and
fingerprint/mode association only, never prompts, inputs, outputs, sessions,
rosters, or memory content.

The Adapter SHALL separately translate Claude's versioned Agent and
`SendMessage` tool results into stable transport evidence. A correlated named
Agent result SHALL first prove an asynchronous launch; that launch alone SHALL
NOT set `teamTransportLiveValidated`. Only a later successful correlated
`SendMessage` to the launched member name SHALL set
`teamTransportLiveValidated: true`. A synchronous/interactive Agent result or
failed/uncorrelated message SHALL terminate the turn as Harness-incompatible.
This validation cannot prevent an attempted call from taking Claude's ordinary
path when its server gate is unavailable, but it SHALL prevent the Plugin from
silently accepting that output as native-team work. Raw Claude status tokens
SHALL NOT escape the Adapter as Plugin business protocol.

#### Scenario: Leaf still exposes Agent
- **WHEN** a leaf initialization advertises native init name `Task` despite the emitted `Agent` deny policy
- **THEN** the turn fails as incompatible before accepting ordinary model work

#### Scenario: Team lead still exposes ListAgents
- **WHEN** an orchestrator initialization advertises machine-global `ListAgents`
- **THEN** the turn fails as incompatible instead of trusting the prompt boundary

#### Scenario: Claude adds a benign unknown tool
- **WHEN** initialization contains a tool name absent from the known baseline but not from the pinned forbidden set
- **THEN** the turn may continue, the new name is retained as bounded advisory drift evidence, and any validation label remains explicitly scoped to the reviewed deny set

#### Scenario: Leaf initialization omits tool inventory
- **WHEN** an otherwise compatible leaf initialization event does not expose an authoritative tool inventory
- **THEN** the turn may continue but the runtime records `denySetLiveValidated: false` for that fingerprint and mode

#### Scenario: Orchestrator definitions are silently ignored
- **WHEN** orchestrator initialization omits one of `haiku-scout`, `sonnet`, or `opus`, or does not expose the necessary coordination tool names
- **THEN** the turn fails as Harness-incompatible instead of trusting `--agents` help text or assistant prose

#### Scenario: Agent Teams gate is inactive despite clean init names
- **WHEN** a named Agent does not produce a correlated asynchronous launch or no correlated `SendMessage` succeeds for the launched member name
- **THEN** the turn records `teamTransportLiveValidated: false` and fails as Harness-incompatible instead of accepting ordinary-subagent output

### Requirement: Native-surface observation history is bounded
The runtime SHALL retain at most sixteen latest sanitized observation records
across executable fingerprint and delegation-mode pairs, ordered by observation
time with deterministic tie-breaking. It SHALL preserve the current
fingerprint's latest records during eviction when they exist. Classification
SHALL occur before any bounded display/storage cap so a forbidden name cannot
be truncated away. Malformed observations SHALL fail closed without leaking
filesystem paths or raw initialization content.

#### Scenario: Seventeenth historical fingerprint is observed
- **WHEN** recording a new sanitized surface would exceed sixteen records
- **THEN** deterministic oldest non-current evidence is evicted without changing the current fingerprint's latest mode records

#### Scenario: Inventory exceeds display cap
- **WHEN** initialization advertises more names than the bounded diagnostic payload retains
- **THEN** the runtime classifies the complete normalized inventory first and only then truncates non-decision-bearing display evidence
