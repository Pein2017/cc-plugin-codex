## Purpose

Define the cross-Harness behavioral authority and workspace writer-admission boundary that prevents concurrent Agents from mutating one canonical worktree while remaining honest about the absence of an OS sandbox.

## Requirements
### Requirement: Behavioral authority is explicit and immutable per Agent
Every version-3 Agent SHALL carry `behavioral_read_only` or `behavioral_write` authority selected explicitly at spawn. The authority SHALL remain immutable across follow-up and recovery. Behavioral read-only SHALL be represented as a prompt/Harness policy unless a Driver proves a stronger enforcement mechanism; the Plugin SHALL NOT describe it as filesystem containment.

#### Scenario: Read-only Agent starts
- **WHEN** explicit behavioral read-only authority is admitted by the selected route
- **THEN** every turn inherits that boundary and receipts identify its actual enforcement strength

#### Scenario: Follow-up requests write
- **WHEN** a read-only Agent receives a request to change authority
- **THEN** the request fails and a separately named write-authorized Agent is required

### Requirement: One canonical workspace has at most one behavioral writer
Before native input acceptance, every write-authorized Agent turn SHALL acquire one durable lease keyed by the canonical workspace root and bound to owner root, Agent, job, Harness, instance, and route. Read-only turns MAY coexist with the writer subject to their Driver capabilities. A second writer SHALL fail fast without launching or accepting native input.

#### Scenario: Two Harnesses request write access to one worktree
- **WHEN** one turn already holds the workspace writer lease
- **THEN** the other turn is rejected before native input acceptance regardless of Harness or model

#### Scenario: Writers use distinct prepared worktrees
- **WHEN** their canonical workspace roots differ
- **THEN** their leases do not collide and the Plugin does not create or merge either worktree

### Requirement: Writer lease release requires settled execution evidence
The writer lease SHALL release only after terminal native state and settled turn-owned execution are proven. Worker loss, failed interruption, unknown remote state, or contradictory mutation evidence SHALL retain the lease and surface an operator-actionable blocked condition. No model-facing operation SHALL force-clear a writer lease in the first multi-Harness generation.

#### Scenario: Worker disappears after write-capable input acceptance
- **WHEN** the Driver cannot prove whether the native turn or its commands settled
- **THEN** the writer lease remains held and later write turns fail closed

### Requirement: Read-only acceptance measures observed mutation separately from enforcement
Experimental read-only Driver acceptance SHALL record a before/after repository and workspace mutation witness for each real smoke while retaining the declared enforcement strength. Zero observed mutation SHALL be evidence for those sampled turns only and SHALL NOT upgrade prompt-only authority to an OS security claim.

#### Scenario: Read-only smoke changes a file
- **WHEN** the before/after witness detects any unapproved workspace or repository mutation
- **THEN** the Driver acceptance fails and reports bounded paths without claiming containment

### Requirement: Unknown writer ownership has an operator-only reconciliation procedure
The first multi-Harness generation SHALL expose read-only operator evidence for an unknown writer lease, including the bound route/attempt, last authoritative observation, and exact class of evidence required to release it. No model-facing operation SHALL clear the lease. Any later operator reconciliation or force-clear capability SHALL require a separate change, explicit target confirmation, a backup, proof that no native work remains or an explicit warning-bearing override, and an auditable receipt.

#### Scenario: Writer lease remains unknown
- **WHEN** no authoritative terminal or absence evidence exists
- **THEN** model-facing write admission remains blocked and diagnostics identify the bounded operator next step without releasing the lease
