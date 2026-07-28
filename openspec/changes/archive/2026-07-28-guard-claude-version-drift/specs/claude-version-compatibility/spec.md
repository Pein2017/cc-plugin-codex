## ADDED Requirements

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
current terminal-parity and safe execution profiles. A missing option, failed or
timed-out probe, or unstable fingerprint SHALL make readiness false and SHALL
fail before a new Agent, job, or idle follow-up activation is durably published.
It SHALL NOT pin a semantic-version range or fall back to another executable,
model, or effort.

#### Scenario: Required flag is missing
- **WHEN** the new Claude CLI help omits a flag used by the runtime
- **THEN** readiness reports the version, executable, missing surface, and incompatibility without launching Claude

#### Scenario: Compatible frontier version appears
- **WHEN** a previously unseen version advertises the complete required surface and stays stable through the probe
- **THEN** readiness admits it as statically compatible and live-unverified without requiring a repo change

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
