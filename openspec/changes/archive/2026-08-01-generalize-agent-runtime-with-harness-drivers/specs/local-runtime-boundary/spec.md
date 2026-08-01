## ADDED Requirements

### Requirement: Harness dependencies remain explicit behind checkout-owned Drivers
Each admitted Harness SHALL declare its host executable, native configuration/session identity, authentication boundary, compatibility detector, and redacted readiness evidence through its checkout-owned Driver. Those host components MAY remain external execution dependencies, but Driver source, registry, lifecycle orchestration, and durable state ownership SHALL remain inside `/data/CoordExp/cc-plugin-codex`. No Driver SHALL load source or Git objects from upstream repositories, registered development worktrees, or versioned Plugin Cache paths.

#### Scenario: Claude Code Driver becomes ready
- **WHEN** the current registry validates its only admitted Driver
- **THEN** readiness identifies the host `claude` executable and fixed Claude configuration as external dependencies while all Driver and supervisor source resolves to the canonical checkout

#### Scenario: Future Harness CLI is unavailable
- **WHEN** an in-tree Driver cannot resolve or validate its declared host executable
- **THEN** readiness fails for that route without substituting a raw provider API, upstream package, Cache runtime, or another Harness

### Requirement: Harness implementation selection is not model-facing
Model-facing lifecycle calls SHALL NOT accept a Harness executable path, Driver module, native configuration directory, environment file, authentication store, capability override, or compatibility bypass. The static Driver registry and each Driver's checkout-owned environment owner SHALL resolve those values before durable Agent creation. A future public Harness selector MAY choose only an admitted stable Harness ID through a separately versioned API.

#### Scenario: Caller attempts executable override
- **WHEN** spawn or follow-up supplies a binary, module, configuration, environment, or capability selector
- **THEN** the runtime rejects the unsupported input before route validation, state mutation, or process launch

#### Scenario: Current public API omits Harness
- **WHEN** the current-generation API starts a supported Claude Agent
- **THEN** the sole admitted `claude-code` Driver is recorded internally without inferring a Driver from an arbitrary executable or ambient model alias
