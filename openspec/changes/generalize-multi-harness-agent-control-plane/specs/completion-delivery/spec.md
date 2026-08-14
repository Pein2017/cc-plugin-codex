## ADDED Requirements

### Requirement: Completion requires native and execution-world settlement
An Agent-linked completion event SHALL be created only when the normalized Driver result proves the native turn is terminal and all turn-owned execution is settled or not applicable. A persistent Harness session, idle shell, or reusable server MAY remain available after a turn; residency alone is not outstanding work. Unknown, active, or contradictory settlement SHALL not publish, freeze, or acknowledge a terminal completion.

#### Scenario: Persistent session is idle after a turn
- **WHEN** the native turn is terminal and its turn-owned commands are settled while the reusable session remains available
- **THEN** completion is published and session continuity may be preserved independently

#### Scenario: Worker loss leaves remote execution unknown
- **WHEN** no valid observation proves whether the native turn or turn-owned commands settled
- **THEN** no completion event is emitted and any preexisting completion payload remains unchanged

### Requirement: Terminal projection records continuation and execution evidence independently
Each new completion fact SHALL retain the immutable Agent route, capability snapshot, transcript continuation classification, execution-world continuity, and settlement evidence as separate bounded fields. Transcript continuation SHALL NOT imply that a shell, workspace, remote task, or side effect is settled, and execution continuity SHALL NOT imply that a transcript can be resumed.

#### Scenario: Transcript resumes but execution state was lost
- **WHEN** a Driver proves exact conversation continuation but cannot preserve the prior execution world
- **THEN** the completion records those facts separately and guidance does not claim full-session continuity

### Requirement: Completion and usage facts preserve route and attempt lineage
Every completion and bounded usage fact SHALL remain attributable to one trusted root, Agent, turn, attempt, Harness, logical instance, full model, Driver version, capability-schema version, topology, and behavioral authority. Equal model strings on different Harnesses or attempts SHALL NOT be merged. Provider-reported metrics SHALL retain their provenance and absence; the runtime SHALL NOT infer cost, cache hits, savings, or accepted work from latency alone.

#### Scenario: Same model string is used through two Harnesses
- **WHEN** both turns report usage
- **THEN** the ledger and completions preserve two independent route lineages rather than aggregating them as one provider fact
