# local-runtime-boundary Specification

## Purpose

Define the checkout-owned runtime, host Claude dependency, environment selection, and portability boundary.
## Requirements
### Requirement: Checkout-owned executable runtime
The installed CC for Pein plugin SHALL load executable runtime source from the configured local checkout and SHALL NOT load runtime source from an upstream repository or versioned plugin Cache path.

#### Scenario: Matching checkout delegates successfully
- **WHEN** the installed bootstrap resolves `CC_RUNTIME_CHECKOUT` to the expected local checkout
- **THEN** it delegates execution to that checkout's public runtime entrypoint

#### Scenario: Source root mismatch fails closed
- **WHEN** the configured checkout and loaded runtime source resolve to different canonical paths
- **THEN** the runtime refuses to execute and reports the source mismatch

### Requirement: Host Claude Code dependency is explicit
The runtime SHALL use the host `claude` CLI for authentication, Claude configuration, sessions, hooks, memories, skills, plugins, MCP configuration, and tool execution.

#### Scenario: Claude CLI is unavailable
- **WHEN** the configured Claude executable cannot be resolved
- **THEN** readiness fails without substituting an upstream package or cached runtime

### Requirement: Exactly one environment file is selected
The runtime SHALL select at most one dotenv-compatible environment file in this precedence order: explicit path, `${CODEX_HOME}/.env`, nearest ancestor `.codex/.env`, then checkout default. It SHALL parse values as data and SHALL NOT evaluate the file as shell code.

#### Scenario: Explicit environment file wins
- **WHEN** an existing explicit environment file is provided together with lower-precedence candidates
- **THEN** only the explicit file overlays the inherited environment

#### Scenario: Explicit environment file is missing
- **WHEN** an explicit environment-file path does not exist
- **THEN** startup fails instead of silently falling back

### Requirement: Runtime environment preserves required host settings
The selected environment SHALL carry `CLAUDE_CONFIG_DIR`, uppercase and lowercase proxy variables, no-proxy variables, `CONDA_EXE`, `PATH`, and other valid inherited or file-defined values to the Claude subprocess without exposing arbitrary secrets in receipts.

#### Scenario: Proxy and Claude config are recorded safely
- **WHEN** readiness or execution emits an environment receipt
- **THEN** it identifies the Claude config directory and redacted proxy endpoints without recording proxy credentials or unrelated environment values

### Requirement: Runtime support scope is Linux
The checkout-owned runtime SHALL support Node.js 20.19 or newer on Linux. macOS
and native Windows behavior is best-effort and SHALL NOT be treated as a release
or compatibility guarantee without a separate OpenSpec change and real-platform
acceptance evidence.

#### Scenario: Supported Linux runtime starts
- **WHEN** the checkout runs on Linux with a compatible Node.js and host Claude CLI
- **THEN** the full runtime, installation, process-control, and state-protection contracts apply

#### Scenario: Non-Linux runtime is attempted
- **WHEN** the checkout is invoked on macOS or native Windows
- **THEN** any surviving defensive behavior is explicitly unsupported and its limitations do not block the Linux release
