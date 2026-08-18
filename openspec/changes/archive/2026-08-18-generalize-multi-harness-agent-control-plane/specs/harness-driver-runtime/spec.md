## MODIFIED Requirements

### Requirement: Harness Drivers own one complete native turn
Each Harness Driver SHALL own executable or service discovery, native configuration and authentication, Harness-specific unreadiness, route validation, prepared-turn validation and immediate revalidation, prompt/envelope construction, protocol parsing, native tool/subagent behavior, bounded transport recovery, native session and turn evidence, failure classification, and optional native history for one complete Agent turn. The supervisor SHALL consume a versioned Driver contract that returns a process-local live turn handle after native acceptance. The live handle SHALL expose one completion promise and only the active-input or interrupt-request methods admitted by the accepted capability snapshot. The supervisor SHALL NOT require a child PID, integer exit status, token-level protocol, or tool-schema parity.

The Driver SHALL publish a Driver-validated, secret-free durable native-turn reference before input is considered accepted and MAY separately publish a native-session reference for continuation. Those references MAY be used only by the same Driver's bounded validators/observer and SHALL NOT contain a live socket, stream, callback, bearer credential, authentication header, executable environment, arbitrary URL, or general serialized Driver state. The normalized terminal result SHALL contain native turn state, execution-world settlement, continuation evidence, bounded activity/metrics receipts, and the final outer-assistant message or an explicit absence reason. It SHALL remain Harness-neutral and SHALL NOT require a repository-research ontology or native tool/event transcript.

#### Scenario: Local CLI turn completes
- **WHEN** a Driver-owned child process exits and the Driver proves coherent native terminal and execution settlement evidence
- **THEN** the Driver returns one Harness-neutral terminal result without making process evidence a universal contract field

#### Scenario: Service-backed turn completes
- **WHEN** a Driver observes a terminal service session while no Plugin-owned model process exists
- **THEN** the same supervisor lifecycle accepts that terminal evidence without inventing an exit status or child PID

#### Scenario: Native result is contradictory
- **WHEN** terminal status conflicts with native turn state, execution settlement is active or unknown, the durable reference is invalid for that Driver, or the result belongs to another Harness, instance, route, or Driver version
- **THEN** the supervisor rejects terminal projection and retains conservative ownership instead of publishing a false completion

### Requirement: Driver capabilities are closed, versioned, and fail closed
Each admitted logical Harness instance SHALL publish a versioned route-specific capability snapshot for interaction policy, active input, transcript continuation, history, interrupt request, terminal observation, automatic recovery, authority enforcement, leaf enforcement, and native orchestration using closed values. Interaction policy SHALL be `noninteractive_fixed_policy` or `requires_broker`; the first multi-Harness generation SHALL admit only `noninteractive_fixed_policy`. Capability maturity SHALL be recorded independently as `experimental` or `validated`. Every prepared Agent turn SHALL persist the accepted Driver version, capability-schema version, instance key, canonical route, and capability snapshot. Unknown values, missing required capabilities, caller-supplied overrides, broker-required routes, or use of an operation not admitted by that exact snapshot SHALL fail before native input acceptance or return an explicit unsupported receipt without mutating continuity.

#### Scenario: Active input is unsupported
- **WHEN** a caller sends a message to a route whose snapshot declares initial input only
- **THEN** the supervisor durably queues the message and does not claim active delivery

#### Scenario: Interrupt can be requested but not observed after worker loss
- **WHEN** a route admits live interrupt requests but no restart-safe terminal observation
- **THEN** the live worker may request interruption, while a lost worker leaves settlement `unknown` and retains affected leases

#### Scenario: One experimental capability fails
- **WHEN** an experimental capability is unavailable or fails validation for one route
- **THEN** the runtime blocks that operation or route without automatically disabling unrelated capabilities or logical instances

#### Scenario: Harness requires interactive approval
- **WHEN** route inspection reports `requires_broker`
- **THEN** the first-generation runtime reports the route unavailable instead of auto-approving, waiting on a TUI, or inventing a generic approval protocol

## ADDED Requirements

### Requirement: Logical Harness instances are admitted before route validation
The checkout-owned Driver registry SHALL inspect a bounded static set of logical instances without model execution or lifecycle mutation. Instance inspection SHALL return a stable Driver-derived instance key, redacted readiness, `liveValidated`, maturity, and safely discoverable route facts. Route validation SHALL require an admitted instance and return one canonical immutable route plus its accepted capability snapshot; it SHALL never choose a Harness, model, topology, or authority for the caller.

#### Scenario: Two admitted instances differ in readiness
- **WHEN** one logical instance is unavailable and another is ready
- **THEN** readiness reports each independently and the unavailable instance does not disable the ready one

#### Scenario: Instance selection is ambiguous
- **WHEN** a generation that exposes no instance selector discovers multiple eligible instances for one Harness
- **THEN** route validation fails closed rather than selecting one from order, environment, or prior use

### Requirement: Driver Contract v2 is intentionally incompatible with v1
The runtime SHALL reject a Driver that implements another contract generation. The Claude legacy adapter MAY translate existing v1/v2 durable Claude records into the v2 supervisor model, but SHALL NOT accept a Driver v1 terminal result directly, preserve v1 process-shaped fields as universal evidence, or dynamically downgrade the supervisor contract.

#### Scenario: Version-one Driver is registered
- **WHEN** a factory returns a Driver with the old contract generation
- **THEN** static registration fails before readiness, Agent mutation, or native execution

#### Scenario: Legacy Claude Agent is controlled
- **WHEN** a valid existing Claude Agent is resumed or interrupted
- **THEN** the checkout-owned Claude legacy adapter preserves its identity and evidence while exposing only v2 control-plane facts to the supervisor

### Requirement: Driver scope and prompt envelope are least-authority boundaries
The supervisor SHALL provide a Driver only the canonical workspace identity, trusted root/Agent/turn/attempt identifiers, immutable accepted route and capabilities, bounded task input, assigned mailbox inputs, deadlines/signals, and that Driver's admitted fixed environment view. It SHALL NOT provide registry/store mutation APIs, another Driver, MCP tools, arbitrary environment, credentials, route selection, or another Agent's native references. Driver-added prompt text SHALL be limited to immutable authority/topology facts, the caller task input, and a bounded return contract; task decomposition, methodology selection, cross-worker synthesis, and final acceptance SHALL remain with Codex.

#### Scenario: Driver requests supervisor internals
- **WHEN** a Driver attempts to access the registry, durable store owner, MCP operation, another Driver, or arbitrary environment through its scope
- **THEN** contract validation fails before native submission

#### Scenario: Driver prepares an ordinary turn
- **WHEN** the route is admitted and the task input is bounded
- **THEN** the Driver may add only its Harness-specific authority/topology/return envelope and cannot silently create a second scheduler policy
