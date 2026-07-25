## ADDED Requirements

### Requirement: Agent Thread has a stable durable identity
The runtime SHALL persist each Agent with a schema version, stable generated ID, stable root-relative path, root-unique name, optional description, root thread ID identical to hardened `ownerRootId`, canonical workspace root, current job pointer, validated Claude session pointer, lifecycle status, timestamps, and latest completion sequence.

#### Scenario: Agent finishes its first turn
- **WHEN** the initial job reaches a terminal state
- **THEN** the same Agent ID and path remain while its status, current job, Claude session, and completion sequence are atomically updated

### Requirement: Agent names are unique within a Codex root
The runtime SHALL reject a duplicate Agent name within the same root and SHALL NOT silently rename, suffix, or resume an existing Agent.

#### Scenario: Root spawns a duplicate name
- **WHEN** an Agent with the requested normalized name already exists in that root
- **THEN** spawn fails with the conflicting Agent identity and no Claude job starts

#### Scenario: Different roots use the same name
- **WHEN** two Codex roots independently spawn the same Agent name
- **THEN** each receives a distinct root-scoped Agent identity

### Requirement: Agent registry is root-scoped by default
Normal Agent lookup and control SHALL use the immutable trusted root thread ID injected by the Codex bootstrap and SHALL resolve only Agents owned by that root. Model-facing calls SHALL NOT supply or override this identity.

#### Scenario: Root lists its Agents
- **WHEN** `list_agents` is called
- **THEN** only Agents owned by the current root are returned

#### Scenario: Foreign Agent path is supplied
- **WHEN** a root references an Agent owned by another root
- **THEN** lookup fails without exposing or modifying the foreign Agent

### Requirement: All-roots view is explicit and read-only
The runtime SHALL allow an explicit diagnostic all-roots Agent listing only through a separate operator CLI and SHALL keep it absent from the six model-facing operations. All Agent mutations SHALL remain trusted-root scoped.

#### Scenario: Debug all view is requested
- **WHEN** the operator invokes the Agent diagnostic CLI with `--all`
- **THEN** redacted Agent snapshots across roots are returned for diagnosis

#### Scenario: Debug output is used for mutation
- **WHEN** the caller attempts to message, follow up, wait on, interrupt, or acknowledge a foreign Agent
- **THEN** the normal root authorization boundary rejects it

### Requirement: One Agent has at most one active turn
The registry SHALL permit at most one active internal job for an Agent while allowing different Agents in the same root to run concurrently within the active capacity policy.

#### Scenario: Follow-up is requested twice concurrently
- **WHEN** two callers try to activate the same terminal Agent
- **THEN** exactly one wins the atomic transition and the other receives an already-active receipt

### Requirement: Agent continuity is independent from job retention and process residency
Agent identity and its latest validated Claude session pointer SHALL remain usable after old internal jobs are pruned and after every Claude worker has exited.

#### Scenario: Agent's older jobs are pruned
- **WHEN** the root exceeds its 100 terminal-job receipt limit
- **THEN** the Agent remains listed and eligible for exact-session follow-up using its registry pointer

### Requirement: Agent session pointer rejects drift
The registry SHALL update an Agent's Claude session pointer only from an owner-valid job whose observed session matches its expected exact-session contract.

#### Scenario: Resumed turn reports another session
- **WHEN** Claude reports a different session ID from the Agent's resume target
- **THEN** the turn becomes errored and the prior valid Agent session pointer is preserved

### Requirement: Claude session identity is bound to one root and Agent
The registry SHALL persist a canonical `(CLAUDE_CONFIG_DIR, Claude session ID)` binding to `ownerRootId` and `agentId` when a new Agent session is first observed. Model-facing spawn SHALL NOT adopt an unbound or foreign session.

#### Scenario: New Agent session is observed
- **WHEN** the first turn reports a Claude session ID and all lease checks pass
- **THEN** the runtime atomically binds that session to the trusted root and Agent before making it resumable

#### Scenario: Model attempts foreign session adoption
- **WHEN** model-facing `spawn_agent` supplies or references an existing unbound or foreign Claude session
- **THEN** the runtime rejects the input and requires a separate user-authorized operator adoption workflow

### Requirement: First-turn failure does not create an unusable silent mailbox
The runtime SHALL roll back an Agent reservation when failure occurs before process launch. After launch, it SHALL permit a fresh-session retry on the same Agent only when durable evidence proves no Claude session and no possible side effect; otherwise it SHALL mark the Agent activation-blocked and reject non-activating messages that could never be delivered.

#### Scenario: Readiness fails before launch
- **WHEN** Agent reservation succeeds but readiness or launch validation fails before spawning Claude
- **THEN** the reservation and name index are rolled back atomically

#### Scenario: First turn fails safely before session capture
- **WHEN** the receipt proves no session, tool use, file touch, or other possible side effect
- **THEN** `followup_task` may retry the same Agent on a fresh session

#### Scenario: First turn fails ambiguously
- **WHEN** no resumable session exists and possible side effects cannot be excluded
- **THEN** the Agent is errored and activation-blocked, and `send_message` rejects instead of queueing forever

### Requirement: Agent v1 has no close or archive lifecycle
Completed, interrupted, and errored Agents SHALL remain logical root-owned records without requiring close, archive, or delete for resource cleanup.

#### Scenario: Completed Agent has no follow-up yet
- **WHEN** its current turn finishes
- **THEN** it remains visible with no resident Claude process and no required cleanup action
