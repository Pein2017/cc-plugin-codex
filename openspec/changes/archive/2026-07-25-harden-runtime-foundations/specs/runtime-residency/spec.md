## ADDED Requirements

### Requirement: Terminal jobs do not retain live Claude processes or idle supervisors
A job SHALL NOT be published as terminal until its Claude child has exited, durable process ownership has been cleared, and any Claude session lease has been released. The supervisor worker SHALL exit immediately after terminal publication rather than entering an idle resident loop.

#### Scenario: Job completes normally
- **WHEN** Claude returns a valid terminal result
- **THEN** the Claude child is gone, process identities are cleared, the session lease is released, and the supervisor exits immediately after publishing the terminal receipt

#### Scenario: Interrupt reaches terminal state
- **WHEN** graceful interruption succeeds
- **THEN** process exit is verified within a bounded cleanup window before the interrupted completion is published

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
If the runtime introduces a concurrency limit, the limit and rejection behavior SHALL be traceable to the retained capacity evidence and SHALL fail fast before launching an excess Claude process.

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
