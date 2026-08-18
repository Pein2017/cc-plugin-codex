## RENAMED Requirements

- FROM: `Terminal jobs do not retain live Claude processes or idle supervisors`
- TO: `Terminal jobs do not retain live turn ownership or idle supervisors`

## MODIFIED Requirements

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
