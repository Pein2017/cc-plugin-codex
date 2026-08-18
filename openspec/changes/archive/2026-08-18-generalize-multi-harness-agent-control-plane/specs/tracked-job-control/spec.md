## MODIFIED Requirements

### Requirement: Durable Claude child evidence gates turn execution
For a Claude-backed prepared or running job, the Claude Driver/legacy adapter SHALL retain `preClaudeLaunch=true` until a valid exact Claude child PID identity is atomically accepted for that active job. The adapter SHALL perform this acceptance before writing initial prompt bytes, starting an input pump, or invoking a hook that can expose the task to Claude. A rejected, throwing, or identity-less Claude child acceptance SHALL terminate the child without writing the prompt. Clearing the marker SHALL conservatively end safe-fresh replay eligibility even if a later receipt does not prove a prompt write. Non-Claude and version-three generic turns SHALL instead use the durable launch-claim/attempt and exact native-turn acceptance contract; they SHALL NOT fabricate a Claude PID or use `preClaudeLaunch` as their universal gate.

#### Scenario: Claude child is accepted
- **WHEN** the spawned Claude child has valid PID identity and the active-job compare-and-swap accepts it
- **THEN** the same durable transition records the child evidence, clears `preClaudeLaunch` and safe-fresh retry, and only then permits prompt delivery

#### Scenario: Claude child acceptance is rejected
- **WHEN** the Claude job no longer owns the activation, PID identity is missing, or the acceptance callback rejects or throws
- **THEN** zero prompt bytes are written, the child is terminated, and the durable job retains its pre-Claude marker

#### Scenario: Crash follows accepted Claude child evidence
- **WHEN** the Claude launch receipt was durably accepted but the runtime crashes before proving a prompt write
- **THEN** recovery treats the job as potentially executed and does not safe-fresh replay it

#### Scenario: Service-backed Driver submits a turn
- **WHEN** a non-Claude Driver begins a version-three attempt
- **THEN** launch claim and exact native-turn evidence gate acceptance without requiring or inventing a Claude child identity

## ADDED Requirements

### Requirement: Control request and terminal settlement are distinct durable facts
An active turn control command SHALL have a stable command identity and separately record request state `none`, `accepted`, `rejected`, or `unsupported`; settlement `pending`, `settled`, or `unknown`; and native turn state `active`, `terminal`, or `unknown`. Accepting an interrupt request SHALL NOT itself transition the job or Agent to a terminal state.

#### Scenario: Driver accepts an interrupt request
- **WHEN** the live Driver sends the native request successfully
- **THEN** the command records request `accepted` and settlement `pending` until valid native terminal evidence arrives

#### Scenario: Settlement deadline expires
- **WHEN** no valid native terminal or restart-safe observation arrives before the bounded control deadline
- **THEN** settlement becomes `unknown`, the Agent remains conservatively nonterminal, and no interrupted completion is synthesized

#### Scenario: Interrupt is unsupported
- **WHEN** the persisted route capability does not admit interrupt requests
- **THEN** control returns `unsupported` without changing native state, Agent continuity, or leases

### Requirement: Live control executes only in the worker that owns the native connection
The supervisor SHALL persist control commands independently from the detached turn worker. The worker SHALL observe a command through the Plugin-owned durable wake path and invoke the process-local live turn handle. Another MCP call, CLI process, or recovered supervisor SHALL NOT reconstruct a socket, stream, callback, or SDK object from durable state.

#### Scenario: Interrupt arrives through another MCP call
- **WHEN** an isolated call records an interrupt for a currently running detached worker
- **THEN** that worker receives the command and uses its existing Driver-local connection to request interruption

#### Scenario: Worker disappears before handling the command
- **WHEN** no live owner can receive the durable command
- **THEN** reconciliation uses only the Driver-validated native-turn reference and optional observation capability, otherwise settlement remains unknown

### Requirement: Public interrupt never auto-escalates to destructive cancellation
The supervisor SHALL NOT turn a rejected, failed, or unobserved graceful interrupt request into automatic forced cancellation. Destructive Driver-specific cleanup MAY occur only as an internal ownership-recovery action with its own proven target and outcome; it SHALL default to unknown or failed/nonresumable evidence and SHALL NOT be represented as the successful public interrupt request.

#### Scenario: Graceful request is rejected
- **WHEN** the Driver reports that the native Harness rejected interruption
- **THEN** the current turn remains active and the public receipt reports the rejected/still-working disposition without issuing a second destructive operation
