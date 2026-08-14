## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: Initial OpenCode capabilities are independently experimental
The exact discovered OpenCode Explorer route SHALL publish instance capacity one and an experimental snapshot with `noninteractive_fixed_policy`, initial-only input, unavailable history, unsupported interrupt request, unavailable restart observation, no automatic recovery, Harness-policy read-only enforcement, effective leaf/tool denial, and disabled native orchestration. Continuation SHALL be `exact_resume` only when the compatibility probe proves authoritative exact session and Server/session incarnation binding across calls; otherwise it SHALL be `fresh_only`. Each later capability SHALL require its own evidence and OpenSpec change; enabling one SHALL NOT silently enable the others.

#### Scenario: History later becomes validated
- **WHEN** a future change proves bounded root-safe OpenCode history
- **THEN** that capability may advance without changing write, interrupt, active-input, concurrency, or orchestration maturity

#### Scenario: Server incarnation evidence is unavailable
- **WHEN** the pinned Server/client cannot prove that a persisted session belongs to the original authoritative instance and binding
- **THEN** continuation is fresh-only and same-Agent OpenCode follow-up is rejected without session reuse
