## ADDED Requirements

### Requirement: Durable native-turn references use a core envelope and Driver schema
Every accepted native turn SHALL persist separate bounded core envelopes for any reusable native session and the exact native turn. Each envelope SHALL contain the Harness ID, Driver version, logical instance key, locator schema version, and one Driver-validated locator. Each static Driver SHALL define the exact locator shapes it can validate and optionally observe. Locators SHALL be secret-free and SHALL exclude credentials, headers, environment values, arbitrary endpoints, prompts, model output, and live connection objects. A session reference SHALL NOT be used as proof that a specific turn was accepted, active, terminal, or settled.

#### Scenario: Open-ended locator is returned
- **WHEN** a Driver attempts to persist an arbitrary object or an unadmitted locator field
- **THEN** native acceptance fails before input acknowledgement and no secret-shaped object reaches durable state

#### Scenario: Driver no longer understands an old locator
- **WHEN** reconciliation loads a locator version unsupported by the current Driver
- **THEN** observation fails closed, native state becomes unknown, and the runtime does not signal or resume another target

#### Scenario: Session exists but turn identity is absent
- **WHEN** a Driver can validate the reusable native session but cannot validate the exact submitted native turn
- **THEN** turn acceptance and settlement remain unknown and the runtime does not replay the input

### Requirement: Launch claims precede every possible native submission
Before a Driver can submit task input, the runtime SHALL durably bind a unique launch claim and attempt to the trusted root, Agent, job, immutable route/capability snapshot, authority leases, mailbox/input identity, and a bounded input digest. The runtime SHALL separately record `not_submitted`, `acceptance_proven`, `acceptance_rejected`, or `acceptance_unknown`. If the Driver call may have reached the Harness but an exact native-turn reference was not durably proven, acceptance SHALL become unknown, all affected leases SHALL remain held, and no automatic replay, fallback, or replacement session SHALL occur.

#### Scenario: Worker disappears during native submission
- **WHEN** local evidence cannot prove whether the Harness accepted the attempt
- **THEN** the attempt records unknown acceptance, retains admission ownership, and requires later authoritative evidence or operator reconciliation

#### Scenario: Submission fails before transport boundary
- **WHEN** the Driver proves no native request left the process
- **THEN** the attempt records not submitted or rejected without claiming native acceptance

### Requirement: Unknown native settlement retains ownership and admission leases
Harness-instance, native-session, and workspace-writer leases SHALL be released only after terminal native turn evidence and settled turn-owned execution evidence are both valid. A lost worker, unreadable locator, failed observation, contradictory result, or control deadline SHALL preserve affected leases with explicit unknown evidence until later reconciliation proves settlement.

#### Scenario: Service turn becomes unobservable
- **WHEN** a worker dies while a remote native turn may remain active and the Driver cannot observe it
- **THEN** the instance and any writer lease remain held and a competing turn is rejected

#### Scenario: Later observation proves terminal settlement
- **WHEN** the Driver validates the persisted locator and observes coherent terminal state
- **THEN** reconciliation may project the terminal result and release matching leases exactly once

### Requirement: Version-three migration is read-forward and active-owner safe
The runtime SHALL validate version-3 Agent, job, control, native-turn-reference, and lease records without allowing older runtimes or version-1 Drivers to claim their queue state. Existing active or ownership-uncertain v1/v2 Claude records SHALL remain under their current worker. No migration SHALL rewrite, signal, lease, resume, or convert them solely because a newer runtime observed them.

#### Scenario: Older runtime sees a version-three job
- **WHEN** it encounters the new queue or control schema
- **THEN** it rejects the unknown version and cannot claim the worker turn

#### Scenario: Version-three runtime sees an active legacy Claude turn
- **WHEN** verified or uncertain legacy ownership still exists
- **THEN** it leaves the turn and its ownership evidence intact until ordinary terminal reconciliation
