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
Each Harness Driver SHALL own executable discovery, native configuration and authentication, Harness-specific unreadiness explanation, prepared-preflight validation and immediate pre-turn revalidation, route validation, command construction, system-envelope integration, protocol parsing, native tool and subagent behavior, bounded in-turn transport recovery, native session evidence, compatibility checks, Harness-specific failure classification, and optional native history for one complete Agent turn. The supervisor SHALL interact with the Driver only through versioned preflight, unreadiness explanation, prepared-preflight validation/revalidation, start-turn, assigned-input, interrupt, terminal-result, and optional bounded-history operations; it SHALL NOT require token-level or tool-schema parity between Harnesses.

#### Scenario: A Driver completes a turn
- **WHEN** the native Harness reaches a terminal state
- **THEN** the Driver returns a normalized terminal result containing status, failure classification, process and session evidence, continuation evidence, bounded progress/activity receipts, and the final outer-assistant message or an explicit absence reason

#### Scenario: Native tool protocol differs
- **WHEN** a future admitted Harness reports tools or subagents differently from Claude Code
- **THEN** its Driver may retain bounded versioned native receipts without changing the shared supervisor lifecycle or pretending protocol-level parity

#### Scenario: Terminal evidence is contradictory or foreign
- **WHEN** a Driver returns inconsistent status and exit evidence, a native session owned by another Harness, a non-normalized final message, an unclassified failure, or an over-bound Driver receipt
- **THEN** the supervisor rejects the turn result rather than projecting a false terminal Agent state

### Requirement: Driver capabilities are closed, versioned, and fail closed
Each admitted Driver SHALL publish a versioned capability snapshot for active input, continuation, history, interruption, automatic recovery, authority enforcement, leaf enforcement, and native orchestration using the specification's closed values. Every prepared Agent turn SHALL persist the accepted Driver version and capability snapshot. An unknown value, missing required capability, caller-supplied override, or operation unsupported by that snapshot SHALL fail before native process launch or return an explicit unsupported result without mutating Agent continuity.

#### Scenario: Active input is unsupported
- **WHEN** a caller sends steering to a Driver whose snapshot declares `activeInput=initial_only`
- **THEN** the supervisor does not claim active delivery and follows only the explicit durable queued-message semantics admitted for that Agent

#### Scenario: Driver capability vocabulary is unknown
- **WHEN** persisted state or readiness reports a capability value the current runtime does not understand
- **THEN** the runtime fails closed without launching, resuming, signalling, or silently downgrading the turn

#### Scenario: Prompt-only authority is reported
- **WHEN** a Driver can enforce write or topology boundaries only through instructions
- **THEN** its receipt declares `prompt_only` and the supervisor does not represent that boundary as a process security control

### Requirement: Driver registry is static and checkout-owned
The runtime SHALL resolve Drivers only from a static in-tree registry in the canonical checkout. For this change the registry SHALL admit exactly `claude-code`. Model-facing and ambient inputs SHALL NOT select a Driver module, executable, environment file, configuration store, capability snapshot, or implementation path. Adding another Driver SHALL require an OpenSpec-owned in-tree implementation, contract evidence, and an explicit public-generation decision.

#### Scenario: Current Agent starts
- **WHEN** the unchanged public spawn operation accepts a supported Claude route
- **THEN** the internal v2 Agent records `harnessId=claude-code` and the static registry resolves the checkout-owned Claude Code Driver

#### Scenario: Caller supplies a Driver path
- **WHEN** a caller or ambient environment attempts to select a module, executable, Cache snapshot, or external checkout as a Driver implementation
- **THEN** startup rejects the selector before any native process or durable Agent is created

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
