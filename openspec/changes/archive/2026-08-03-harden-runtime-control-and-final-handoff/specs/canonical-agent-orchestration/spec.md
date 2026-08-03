## ADDED Requirements

### Requirement: Activation-pending guidance is operation specific
Public Skill guidance SHALL distinguish a message durably assigned to activation from a message that is still queued, and SHALL direct the lead to join or observe the activated turn rather than repeatedly resending it.

#### Scenario: Follow-up is assigned but worker startup is pending
- **WHEN** `followup_task` has durably assigned a message and reports activation pending
- **THEN** guidance tells the lead to use the existing Agent join path and not submit a duplicate follow-up

### Requirement: Persisted blocking tuples are coherent
The runtime SHALL accept only blocking reason, scope, and retry combinations permitted by the canonical Agent recovery contract and SHALL reject or safely ignore impossible persisted combinations.

#### Scenario: Harness blocking requests same-Agent follow-up
- **WHEN** persisted state combines Harness scope with a same-Agent follow-up retry
- **THEN** the state is rejected or projected as invalid rather than exposed as a valid recovery instruction

#### Scenario: Operator-required retry is Agent scoped
- **WHEN** persisted state combines `operator_required` with Agent scope
- **THEN** the state is rejected or projected as invalid rather than exposed as a valid recovery instruction
