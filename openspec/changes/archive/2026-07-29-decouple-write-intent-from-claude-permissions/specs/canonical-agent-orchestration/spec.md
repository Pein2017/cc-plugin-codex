## MODIFIED Requirements

### Requirement: Model-facing activation selects write intent deliberately
The `spawn-agent` skill SHALL classify each requested turn as read/review or authorized mutation and SHALL pass `write: false` or `write: true` explicitly to the typed tool. The `followup-task` skill SHALL explain that omitted write intent inherits the Agent's latest activation and SHALL pass an explicit value whenever the requested follow-up changes that authority. The skills SHALL describe `write` as a behavioral and durable recovery-risk boundary rather than a Claude CLI permission switch. They SHALL explain that terminal parity uses `IS_SANDBOX=1` and `--dangerously-skip-permissions` for both values and SHALL NOT describe false intent as an OS-enforced read-only sandbox.

#### Scenario: Parent delegates a read-only audit
- **WHEN** the requested Agent should inspect or advise without repository mutation
- **THEN** `spawn-agent` passes `write: false` and instructs the fully capable Claude process not to mutate workspace or repository state

#### Scenario: Parent delegates authorized implementation
- **WHEN** the requested Agent is authorized to modify the workspace
- **THEN** `spawn-agent` passes `write: true` and limits mutations to the delegated task scope

#### Scenario: Follow-up changes authority
- **WHEN** a follow-up changes from read/review work to authorized mutation or from mutation to read/review work
- **THEN** `followup-task` passes the new explicit write intent rather than inheriting the previous one
