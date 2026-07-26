## ADDED Requirements

### Requirement: Durable Claude child evidence gates turn execution
A prepared or running job SHALL retain `preClaudeLaunch=true` until a valid Claude child PID identity is atomically accepted for that exact active job. The adapter SHALL perform this acceptance before writing any initial prompt bytes, starting an input pump, or invoking a hook that can expose the task to Claude. A rejected, throwing, or identity-less acceptance SHALL terminate the child without writing the prompt. Clearing the marker SHALL conservatively end safe-fresh replay eligibility even if a later receipt does not prove a prompt write.

#### Scenario: Claude child is accepted
- **WHEN** the spawned child has valid PID identity and the active-job compare-and-swap accepts it
- **THEN** the same durable transition records the child evidence, clears `preClaudeLaunch` and safe-fresh retry, and only then permits prompt delivery

#### Scenario: Claude child acceptance is rejected
- **WHEN** the job no longer owns the activation, PID identity is missing, or the acceptance callback rejects or throws
- **THEN** zero prompt bytes are written, the child is terminated, and the durable job retains its pre-Claude marker

#### Scenario: Crash follows accepted child evidence
- **WHEN** the launch receipt was durably accepted but the runtime crashes before proving a prompt write
- **THEN** recovery treats the job as potentially executed and does not safe-fresh replay it

## MODIFIED Requirements

### Requirement: Jobs are internal Agent turn receipts
Tracked jobs SHALL remain internal execution records linked to one Agent and SHALL NOT be the model-facing orchestration identity. A terminal receipt that retains `preClaudeLaunch=true` SHALL be treated as a non-turn activation diagnostic until Agent recovery is durably projected; it SHALL NOT bind a Claude session or publish Agent completion.

#### Scenario: Agent starts a later turn
- **WHEN** `followup_task` activates a terminal Agent
- **THEN** a new internal job is linked to the same Agent while callers continue addressing the stable Agent path or ID

#### Scenario: Activation terminates before Claude launch
- **WHEN** an attached job becomes terminal while `preClaudeLaunch=true`
- **THEN** the receipt remains diagnostic evidence and is excluded from session binding and completion publication until dedicated recovery marks it projected
