## ADDED Requirements

### Requirement: Verified supervisor residency prevents premature reaping
The runtime SHALL treat a job as actively owned while either its detached worker identity or its Claude child identity is verified live, and SHALL use the same ownership decision for stale-job reaping and native-session lease admission.

#### Scenario: Child exits before terminal commit
- **WHEN** a Claude child is no longer live but its verified detached worker is still live and has not committed a terminal state
- **THEN** the runtime does not reap the job or allow another job to acquire its native session lease

#### Scenario: Neither owner is live
- **WHEN** neither the recorded worker identity nor the recorded child identity is verified live
- **THEN** the normal stale-job recovery policy may reconcile the job and release its lease

### Requirement: Linux signal failures remain explicit
The runtime SHALL treat only an `ESRCH` signal error as proof that a target process or process group is absent and SHALL surface every other signal error as a control failure.

#### Scenario: Signal is denied
- **WHEN** Linux returns `EPERM` while probing or signalling a Claude process group
- **THEN** the runtime does not report interruption, cancellation, or absence as successful

#### Scenario: Target is already absent
- **WHEN** Linux returns `ESRCH` while signalling a Claude process group
- **THEN** the idempotent termination operation may complete as already absent
