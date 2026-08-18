# harness-driver-runtime Specification

## Purpose
Define the coarse turn-level Harness Driver boundary, capability vocabulary, deterministic driver registry, Claude behavior-preserving first adapter, and the separation between lead routing policy and supervisor lifecycle.
## Requirements

### Requirement: One deterministic supervisor owns Harness-neutral Agent lifecycle
The runtime SHALL use one deterministic supervisor for root ownership, durable Agent identity, mailbox ordering, active-turn arbitration, jobs, completion delivery, bounded wait/progress semantics, verified process control, leases, retention, and reconciliation. The supervisor SHALL accept only an explicit caller-selected route and SHALL NOT decompose tasks, choose a Harness, model, effort, or topology, synthesize Agent results, perform cross-Harness fallback, or retry an account-limit failure through another route.

#### Scenario: Explicit route is accepted
- **WHEN** the Codex lead creates an Agent using an admitted route
- **THEN** the supervisor validates and durably records that route before delegating the turn to its Harness Driver

#### Scenario: Selected Harness reaches an account limit
- **WHEN** a Driver reports a terminal account, subscription, quota, or usage-limit failure
- **THEN** the supervisor preserves that failure and starts no fallback Harness or model

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

### Requirement: Driver registry is static and checkout-owned
The runtime SHALL resolve Drivers only from a static in-tree registry in the canonical checkout. For this generation the registry SHALL admit exactly `claude-code` and `opencode`. Model-facing and ambient inputs SHALL NOT select a Driver module, executable, endpoint, environment file, configuration store, capability snapshot, or implementation path. Adding another Driver SHALL require an OpenSpec-owned in-tree implementation, contract evidence, and an explicit public-generation decision.

#### Scenario: Claude route starts
- **WHEN** spawn explicitly selects `claude-code` with a supported Claude model, topology, and authority
- **THEN** the static registry resolves the checkout-owned Claude Code Driver and freezes its route snapshot

#### Scenario: OpenCode route starts
- **WHEN** spawn explicitly selects `opencode` with the exact admitted Explorer route
- **THEN** the static registry resolves the checkout-owned OpenCode Driver and no default or model alias selects it implicitly

#### Scenario: Caller supplies a Driver path
- **WHEN** a caller or ambient environment attempts to select a module, executable, Cache snapshot, external checkout, Server endpoint, or capability override
- **THEN** startup rejects the selector before any native process, session, model request, or durable Agent is created

### Requirement: Model-facing wait remains completion-first and progress-bounded
Harness Drivers SHALL expose progress evidence to the shared supervisor but SHALL NOT control model-facing polling cadence or delivery budget. The supervisor SHALL preserve the fixed `bound-model-facing-agent-wait` contract: normal join waits until completion or its bounded timeout, explicit progress observation returns at most one new useful non-hook progress update per caller turn, completion wins over progress, and repeated quiet observations do not manufacture new progress revisions.

#### Scenario: Long Harness turn emits many hook events
- **WHEN** the caller intentionally observes progress while no useful non-hook revision or completion exists
- **THEN** the supervisor returns no synthetic update and does not invite a tight wait loop

### Requirement: Driver activity evidence is byte bounded
Each Harness Driver SHALL persist a bounded activity summary that cannot include arbitrary tool-input values, while retaining enough tool names, input-key names, and touched-file evidence for progress observation.

#### Scenario: Tool input contains a large value
- **WHEN** a native tool event contains a multi-megabyte input field
- **THEN** the persisted activity receipt remains within its configured byte bound and does not store that value

### Requirement: Driver completion separates progress from final output
Each Harness Driver SHALL keep progress aggregation independent from the final outer-assistant handoff selected for completion delivery.

#### Scenario: Progress contains earlier assistant text
- **WHEN** progress events include assistant text that precedes the final outer-assistant message
- **THEN** progress remains observable but does not prefix the completion handoff

#### Scenario: Completion and progress become available together
- **WHEN** a Driver reaches terminal state while a new progress revision is pending
- **THEN** the supervisor delivers completion first under the existing acknowledgement contract

### Requirement: Claude credential readiness is local, redacted, and generation-aware
The Claude Code Driver SHALL observe authentication only through the fixed Harness configuration identity and SHALL distinguish local credential presence from a live provider validation. For native OAuth credentials, it SHALL derive a versioned generation only from non-secret filesystem identity and expiry metadata. It SHALL NOT persist or expose access tokens, refresh tokens, token hashes, account identity, organization identity, scopes, raw credential content, or arbitrary environment values. Metadata-only readiness SHALL report `liveValidated: false` and SHALL NOT claim that a provider request has succeeded.

#### Scenario: Current native OAuth credentials are present
- **WHEN** the fixed Claude config contains a readable native OAuth credential record
- **THEN** readiness reports credential presence, bounded local expiry facts, a redacted generation, and `liveValidated: false` without launching a model

#### Scenario: Credential record contains secrets and identity
- **WHEN** the native credential record includes bearer tokens, scopes, email, organization, or other private fields
- **THEN** no readiness, job, Agent, completion, diagnostic, or error receipt contains those values or their hashes

#### Scenario: API key authentication is inherited
- **WHEN** Claude authentication is supplied by an inherited API-key environment value
- **THEN** readiness may report key presence but does not persist a key-derived generation or represent key rotation as automatically proven

#### Scenario: Authentication fails during a native turn
- **WHEN** Claude returns native evidence classified as `auth_or_permission`
- **THEN** the terminal result binds a fresh redacted credential observation to that failure without changing the failure class or claiming resumability

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

### Requirement: Initial OpenCode capabilities are independently experimental
The exact discovered OpenCode Explorer route SHALL publish instance capacity one and an experimental snapshot with `noninteractive_fixed_policy`, initial-only input, unavailable history, unsupported interrupt request, unavailable restart observation, no automatic recovery, Harness-policy read-only enforcement, effective leaf/tool denial, and disabled native orchestration. Continuation SHALL be `exact_resume` only when the compatibility probe proves authoritative exact session and Server/session incarnation binding across calls; otherwise it SHALL be `fresh_only`. Each later capability SHALL require its own evidence and OpenSpec change; enabling one SHALL NOT silently enable the others.

#### Scenario: History later becomes validated
- **WHEN** a future change proves bounded root-safe OpenCode history
- **THEN** that capability may advance without changing write, interrupt, active-input, concurrency, or orchestration maturity

#### Scenario: Server incarnation evidence is unavailable
- **WHEN** the pinned Server/client cannot prove that a persisted session belongs to the original authoritative instance and binding
- **THEN** continuation is fresh-only and same-Agent OpenCode follow-up is rejected without session reuse
