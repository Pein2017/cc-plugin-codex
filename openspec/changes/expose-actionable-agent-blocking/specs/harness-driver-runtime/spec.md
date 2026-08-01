## MODIFIED Requirements

### Requirement: Harness Drivers own one complete native turn
Each Harness Driver SHALL own executable discovery, native configuration and authentication, Harness-specific unreadiness explanation, prepared-preflight validation and immediate pre-turn revalidation, route validation, command construction, system-envelope integration, protocol parsing, native tool and subagent behavior, bounded in-turn transport recovery, native session evidence, compatibility checks, failure classification drawn from the closed turn-failure vocabulary, and optional native history for one complete Agent turn. The supervisor SHALL interact with the Driver only through versioned preflight, unreadiness explanation, prepared-preflight validation/revalidation, start-turn, assigned-input, interrupt, terminal-result, and optional bounded-history operations; it SHALL NOT require token-level or tool-schema parity between Harnesses. A non-completed turn result SHALL carry exactly one admitted turn-failure class, and an unadmitted, empty, or free-text class SHALL be rejected before it becomes durable continuation evidence.

#### Scenario: A Driver completes a turn
- **WHEN** the native Harness reaches a terminal state
- **THEN** the Driver returns a normalized terminal result containing status, failure classification, process and session evidence, continuation evidence, bounded progress/activity receipts, and the final outer-assistant message or an explicit absence reason

#### Scenario: Native tool protocol differs
- **WHEN** a future admitted Harness reports tools or subagents differently from Claude Code
- **THEN** its Driver may retain bounded versioned native receipts without changing the shared supervisor lifecycle or pretending protocol-level parity

#### Scenario: Terminal evidence is contradictory or foreign
- **WHEN** a Driver returns inconsistent status and exit evidence, a native session owned by another Harness, a non-normalized final message, an unclassified failure, a failure class outside the closed turn-failure vocabulary, or an over-bound Driver receipt
- **THEN** the supervisor rejects the turn result rather than projecting a false terminal Agent state

#### Scenario: Driver reports an unadmitted failure class
- **WHEN** a Driver returns a non-completed turn whose failure class is not an admitted value
- **THEN** the supervisor rejects the turn result and no part of that class text reaches durable continuation evidence or a model-facing receipt

## ADDED Requirements

### Requirement: Turn-failure classes are closed and declare blocking scope
The runtime SHALL define one checkout-owned closed vocabulary of Harness turn-failure classes alongside the Driver capability vocabulary, and each admitted class SHALL declare whether it blocks one Agent or the whole Harness instance. The vocabulary SHALL admit only classes a Driver can observe from its own turn, and SHALL NOT admit supervisor-owned facts such as pre-launch compatibility refusal, worker launch or handoff failure, forced unflushed interruption, or stale-job reaping, because no turn result exists when those occur. A caller, ambient input, or persisted record SHALL NOT supply, widen, or override the vocabulary or a class's declared scope. Adding a class SHALL require an OpenSpec-owned in-tree change with contract evidence, exactly as adding a capability value does.

#### Scenario: Account exhaustion is Harness-scoped
- **WHEN** a Driver classifies a turn as account, subscription, quota, or usage-limit exhaustion
- **THEN** that class declares Harness scope so the supervisor can report that every Agent on that Harness instance is affected, while still starting no fallback Harness or model

#### Scenario: Session drift is Agent-scoped
- **WHEN** a Driver classifies a resumed turn as native session drift or foreign session ownership
- **THEN** that class declares Agent scope and sibling current-root Agents remain unaffected

#### Scenario: Supervisor fact is claimed as a Driver class
- **WHEN** a Driver returns a turn-failure class naming worker launch, worker handoff, stale-job reaping, or pre-launch compatibility refusal
- **THEN** the supervisor rejects the turn result because those facts are supervisor-owned and are not admitted into the Driver vocabulary

#### Scenario: Caller attempts to override a declared scope
- **WHEN** a model-facing input, ambient environment value, or persisted record supplies a failure class or a blocking scope
- **THEN** the runtime rejects that input and uses only the checkout-owned declaration

#### Scenario: Interrupted turn does not classify its own flush safety
- **WHEN** a Driver reports a cancelled or interrupted turn
- **THEN** its class states only that the turn stopped, while whether the receipt proves a safe flush remains a supervisor determination that decides the resulting blocking projection
