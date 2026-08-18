# runtime-residency Specification

## Purpose

Define automatic process cleanup, logical-history residency independence, and evidence-driven concurrency policy.

## Requirements

### Requirement: Terminal jobs do not retain live turn ownership or idle supervisors
A job SHALL NOT be published as terminal until its Driver proves the native turn terminal, turn-owned execution settled or not applicable, live control ownership cleared, and all matching active leases released. A reusable external service, native session, or idle execution substrate MAY remain available when it owns no unsettled work for that turn. The detached supervisor worker SHALL exit immediately after terminal publication rather than entering an idle resident loop.

#### Scenario: Local process turn completes
- **WHEN** the Driver proves process exit, coherent native terminal result, and settled turn-owned work
- **THEN** process identity and leases are cleared and the supervisor exits after publishing the terminal receipt

#### Scenario: Service-backed turn completes
- **WHEN** the Driver proves terminal and settled evidence while the operator-owned server remains running
- **THEN** the job completes without treating the persistent server as a resident Agent worker

#### Scenario: Interruption remains unknown
- **WHEN** an interrupt was requested but terminal settlement is not proven
- **THEN** the job remains nonterminal, the worker may exit only after durable uncertainty is recorded, and affected leases remain held

### Requirement: Logical history is independent from residency
Preserving a job, completion event, Agent identity, or Claude session pointer SHALL NOT require a live Claude process.

#### Scenario: Follow-up occurs after process cleanup
- **WHEN** a resumable terminal job receives a later follow-up
- **THEN** a new Claude process resumes the stored exact session rather than reusing a resident idle process

### Requirement: Concurrency capacity is measured before it is capped
The project SHALL collect comparable 1, 3, and 6 concurrent-job evidence before introducing a runtime concurrency cap.

#### Scenario: Controlled concurrency probe runs
- **WHEN** the capacity probe executes a fixed bounded workload
- **THEN** it records baseline and peak memory, latency, failures, transport outcomes, lease conflicts, and post-terminal cleanup for each concurrency level

#### Scenario: Lower level crosses a safety stop rule
- **WHEN** the 3-job level causes resource exhaustion, repeated failure, or unclean process exit
- **THEN** the probe stops before launching 6 jobs and records the observed boundary

### Requirement: Admission policy follows recorded evidence
If the runtime introduces a concurrency limit, the limit and rejection behavior SHALL be traceable to retained capacity evidence and SHALL fail fast before launching an excess Claude process.

#### Scenario: Evidence supports no internal cap
- **WHEN** all planned levels complete within defined resource and reliability thresholds
- **THEN** the change records that no arbitrary internal cap was added

#### Scenario: Evidence establishes a safe bound
- **WHEN** the probe identifies a reproducible unsafe level
- **THEN** the runtime rejects launches above the selected safe bound with an actionable capacity receipt

### Requirement: Manual close or archive is not required for resource cleanup
The runtime SHALL reclaim terminal worker resources automatically and SHALL NOT require a model or user to call close or archive for memory release.

#### Scenario: Many logical records remain
- **WHEN** completed job or future Agent records remain visible in durable state
- **THEN** their presence does not imply any resident Claude process
