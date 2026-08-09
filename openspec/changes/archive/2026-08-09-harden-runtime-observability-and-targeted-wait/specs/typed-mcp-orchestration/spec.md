## ADDED Requirements

### Requirement: Typed wait schema permits one-target progress observation
The typed `wait_agent` schema SHALL accept `wake_on_progress: true` together with `targets` only when the array contains exactly one target. It SHALL continue to reject a progress-enabled target array containing two or more Agents before invoking the runtime, while leaving completion-only target barriers and untargeted progress waits unchanged.

#### Scenario: One target requests progress
- **WHEN** a model-facing call supplies one target and `wake_on_progress: true`
- **THEN** strict validation passes the fixed target observation to the public runtime with the fixed one-hour upper bound

#### Scenario: Multiple targets request progress
- **WHEN** a model-facing call supplies two or more targets and `wake_on_progress: true`
- **THEN** strict validation rejects the call before acknowledgement, delivery, or Agent state changes

#### Scenario: Barrier omits progress
- **WHEN** a model-facing call supplies one to eight valid targets and omits or disables progress wakeup
- **THEN** the existing fixed completion-only targeted join behavior is unchanged
