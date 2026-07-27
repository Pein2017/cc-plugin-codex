## ADDED Requirements

### Requirement: Public lifecycle workspace is inherited from Codex
Each model-facing lifecycle command SHALL use the canonical form of its host process working directory as the Agent workspace and SHALL NOT accept `--cwd`, `-C`, or `--env-file`. Every lifecycle skill SHALL instruct Codex to confirm the intended checkout or worktree before invocation. Private detached-worker reconstruction and explicit read-only operator diagnostics MAY retain their own context arguments, and those arguments SHALL NOT be exposed by Plugin skills.

#### Scenario: Codex invokes a lifecycle command from the intended worktree
- **WHEN** a Plugin skill starts from a Codex process whose cwd is the intended worktree
- **THEN** the public runtime scopes Agent state to that worktree without an additional context argument

#### Scenario: Model-facing context selector is supplied
- **WHEN** any public lifecycle invocation includes `--cwd`, `-C`, or `--env-file`
- **THEN** it fails with an unsupported model-facing option error before selecting a different workspace or environment

#### Scenario: Detached worker reconstructs public context
- **WHEN** a public spawn hands a prepared job to its private detached worker
- **THEN** the runtime may pass the already-canonical workspace through the internal worker's `--cwd` argument

## MODIFIED Requirements

### Requirement: Checkout-owned executable runtime
The installed CC for Pein plugin SHALL load executable runtime source only from the canonical `/data/CoordExp/cc-plugin-codex` checkout. The bootstrap SHALL NOT accept caller or ambient runtime-checkout selection. It SHALL NOT load runtime or Git objects from `/data/CoordExp/external/cc-plugin-codex`, Sendbird, another upstream repository, a Git alternate, a registered development worktree, or a versioned plugin Cache path.

#### Scenario: Matching independent checkout delegates successfully
- **WHEN** the installed bootstrap validates `/data/CoordExp/cc-plugin-codex`
- **THEN** it delegates execution to that checkout's public runtime entrypoint

#### Scenario: Source root mismatch fails closed
- **WHEN** the loaded runtime source does not resolve to the canonical fixed checkout
- **THEN** the runtime refuses to execute and reports the source mismatch

#### Scenario: Development worktree provenance is inspected
- **WHEN** the canonical checkout's Git common directory and remotes are inspected
- **THEN** they resolve only to the independent local clone and its Pein2017 `origin`, with no upstream or external-repo dependency, and no development worktree becomes an executable runtime source

### Requirement: Exactly one environment file is selected
The installed model-facing bootstrap SHALL load exactly `/data/CoordExp/cc-plugin-codex/config/runtime.env`. It SHALL NOT select an environment from invocation arguments, `CC_RUNTIME_ENV_FILE`, `${CODEX_HOME}/.env`, or a workspace `.codex/.env`. It SHALL parse the fixed file as data and SHALL NOT evaluate it as shell code.

#### Scenario: Ambient environment selectors conflict
- **WHEN** inherited `CC_RUNTIME_ENV_FILE`, `CODEX_HOME`, or workspace `.codex/.env` point to other files
- **THEN** the bootstrap ignores them as selectors and loads only the canonical checkout environment file

#### Scenario: Invocation supplies an environment selector
- **WHEN** a model-facing invocation supplies `--env-file`
- **THEN** startup rejects the unsupported option instead of selecting that file

#### Scenario: Fixed environment file is unavailable or invalid
- **WHEN** the canonical environment file is missing or contains invalid dotenv syntax
- **THEN** startup fails instead of silently falling back

#### Scenario: Explicit environment file wins
- **WHEN** a legacy model-facing caller attempts to provide an existing explicit environment file
- **THEN** the fixed Plugin environment wins by rejecting the removed selector before that file can be loaded

#### Scenario: Explicit environment file is missing
- **WHEN** a legacy model-facing caller provides a missing explicit environment-file path
- **THEN** startup rejects the removed selector without checking lower-precedence files or silently falling back

### Requirement: Runtime environment preserves required host settings
The fixed environment file SHALL authoritatively provide both Claude config variables, uppercase and lowercase proxy variables, no-proxy variables, `CONDA_EXE`, and the Claude executable to the model-facing Claude subprocess. Those fixed values SHALL overlay conflicting inherited values. Valid unrelated inherited host values such as `PATH`, Codex root identity, and runtime-state location SHALL remain available. Receipts SHALL expose only the effective config path and redacted network endpoints, not arbitrary environment values.

#### Scenario: Inherited protected value conflicts with fixed config
- **WHEN** the host environment supplies a different Claude config path, proxy endpoint, Conda executable, or Claude executable
- **THEN** the Claude child receives the value from the canonical fixed environment file

#### Scenario: Unrelated host path is inherited
- **WHEN** the host provides a valid `PATH` not defined by the fixed environment file
- **THEN** the Claude child retains that inherited `PATH`

#### Scenario: Proxy and Claude config are recorded safely
- **WHEN** readiness or execution emits an environment receipt
- **THEN** it identifies the effective fixed Claude config directory and redacted proxy endpoints without recording proxy credentials or unrelated environment values

#### Scenario: Native Claude config override is present
- **WHEN** the inherited host environment supplies a non-empty `CLAUDE_NATIVE_CONFIG_DIR` that conflicts with the fixed file
- **THEN** the Claude child receives the fixed canonical value as `CLAUDE_CONFIG_DIR`

#### Scenario: Native override is absent
- **WHEN** the inherited host environment omits or empties `CLAUDE_NATIVE_CONFIG_DIR`
- **THEN** the Claude child still receives the canonical value supplied by the fixed file

### Requirement: Local development separates runtime hot updates from plugin discovery refresh
Executable runtime changes SHALL take effect directly from `/data/CoordExp/cc-plugin-codex` without uninstalling or reinstalling the plugin. Changes to Plugin skills, skill metadata, manifest, or bootstrap SHALL be refreshed by atomically adding the current local Plugin snapshot without first removing the Plugin or a correctly bound marketplace.

#### Scenario: Runtime implementation changes
- **WHEN** a runtime module changes under `/data/CoordExp/cc-plugin-codex`
- **THEN** the next lifecycle invocation executes that new module without a Plugin refresh

#### Scenario: Skill metadata changes
- **WHEN** a skill, skill metadata, manifest, or bootstrap file changes
- **THEN** the local refresh command updates one cachebuster, runs `codex plugin add`, validates the installed snapshot, and directs testing to a new Codex task

#### Scenario: Local marketplace root drifts
- **WHEN** refresh mode detects that `pein-local` points somewhere other than `/data/CoordExp/cc-plugin-codex`
- **THEN** it fails closed instead of silently refreshing from the wrong source; initial installation may explicitly rebind the marketplace once
