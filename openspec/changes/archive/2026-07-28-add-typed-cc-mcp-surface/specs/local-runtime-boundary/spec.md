## MODIFIED Requirements

### Requirement: Checkout-owned executable runtime
The installed CC for Pein plugin SHALL load executable runtime source only from the canonical `/data/CoordExp/cc-plugin-codex` checkout. Both lifecycle and MCP bootstraps SHALL NOT accept caller or ambient runtime-checkout selection. They SHALL NOT load runtime or Git objects from `/data/CoordExp/external/cc-plugin-codex`, Sendbird, another upstream repository, a Git alternate, a registered development worktree, or a versioned plugin Cache path.

#### Scenario: Matching independent checkout delegates successfully
- **WHEN** an installed lifecycle or MCP bootstrap validates `/data/CoordExp/cc-plugin-codex`
- **THEN** it delegates execution to that checkout's matching public runtime entrypoint

#### Scenario: Source root mismatch fails closed
- **WHEN** the loaded runtime source does not resolve to the canonical fixed checkout
- **THEN** the runtime refuses to execute and reports the source mismatch

#### Scenario: Development worktree provenance is inspected
- **WHEN** the canonical checkout's Git common directory and remotes are inspected
- **THEN** they resolve only to the independent local clone and its Pein2017 `origin`, with no upstream or external-repo dependency, and no development worktree becomes an executable runtime source

### Requirement: Exactly one environment file is selected
The installed model-facing lifecycle and MCP bootstraps SHALL load exactly `/data/CoordExp/cc-plugin-codex/config/runtime.env`. They SHALL NOT select an environment from invocation arguments, MCP tool arguments, `CC_RUNTIME_ENV_FILE`, `${CODEX_HOME}/.env`, or a workspace `.codex/.env`. They SHALL parse the fixed file as data and SHALL NOT evaluate it as shell code.

#### Scenario: Ambient environment selectors conflict
- **WHEN** inherited `CC_RUNTIME_ENV_FILE`, `CODEX_HOME`, or workspace `.codex/.env` point to other files
- **THEN** the active bootstrap ignores them as selectors and loads only the canonical checkout environment file

#### Scenario: Invocation supplies an environment selector
- **WHEN** a model-facing CLI or MCP invocation supplies an environment-file selector
- **THEN** startup rejects the unsupported input instead of selecting that file

#### Scenario: Fixed environment file is unavailable or invalid
- **WHEN** the canonical environment file is missing or contains invalid dotenv syntax
- **THEN** startup fails instead of silently falling back

#### Scenario: Explicit environment file wins
- **WHEN** a legacy model-facing caller attempts to provide an existing explicit environment file
- **THEN** the fixed Plugin environment wins by rejecting the removed selector before that file can be loaded

#### Scenario: Explicit environment file is missing
- **WHEN** a legacy model-facing caller provides a missing explicit environment-file path
- **THEN** startup rejects the removed selector without checking lower-precedence files or silently falling back

### Requirement: Public lifecycle workspace is inherited from Codex
Each model-facing lifecycle call SHALL use the canonical Codex turn workspace as the Agent workspace and SHALL NOT accept `--cwd`, `-C`, `--env-file`, or equivalent MCP fields. CLI calls SHALL inherit the host process working directory; MCP calls SHALL require the trusted sandbox-state `sandboxCwd` URI attached by Codex and SHALL NOT fall back to the server process cwd. Every lifecycle skill SHALL instruct Codex to confirm the intended checkout or worktree before invocation. Private detached-worker reconstruction and explicit read-only operator diagnostics MAY retain their own context arguments, and those arguments SHALL NOT be exposed by Plugin skills or MCP schemas.

#### Scenario: Codex invokes a lifecycle call from the intended worktree
- **WHEN** a Plugin CLI call inherits that cwd or a Plugin MCP call receives its trusted sandbox workspace metadata
- **THEN** the public runtime scopes Agent state to that worktree without a model-supplied context argument

#### Scenario: Model-facing context selector is supplied
- **WHEN** any public lifecycle invocation includes `--cwd`, `-C`, `--env-file`, or an equivalent MCP property
- **THEN** it fails before selecting a different workspace or environment

#### Scenario: MCP workspace metadata is unavailable
- **WHEN** an MCP lifecycle call lacks a valid local Codex sandbox workspace URI
- **THEN** it fails instead of using the Plugin Cache, bootstrap, or server process directory

#### Scenario: Detached worker reconstructs public context
- **WHEN** a public spawn hands a prepared job to its private detached worker
- **THEN** the runtime may pass the already-canonical workspace through the internal worker's `--cwd` argument

### Requirement: Local development separates checkout edits from Plugin discovery refresh
Executable runtime source SHALL remain checkout-owned and SHALL NOT require Plugin uninstall/reinstall. A short-lived CLI call SHALL load current checkout modules on its next invocation. A running MCP server SHALL retain its already-loaded module graph until Codex starts a new task or otherwise restarts that server process. Changes to Plugin skills, skill metadata, manifest, `.mcp.json`, or either installed bootstrap SHALL require the atomic local Plugin refresh and a new Codex task for discovery.

#### Scenario: Runtime changes before a new MCP task
- **WHEN** a runtime module changes under `/data/CoordExp/cc-plugin-codex` and Codex starts a new task with the installed Plugin
- **THEN** the descriptor-only bootstrap starts the checkout's revised MCP server without uninstalling the Plugin

#### Scenario: Runtime changes during an existing MCP task
- **WHEN** checkout runtime code changes after that task's MCP server has already loaded it
- **THEN** the existing process is not claimed to hot-reload and acceptance uses a new Codex task or explicit server restart

#### Scenario: Plugin discovery files change
- **WHEN** a skill, skill metadata, manifest, `.mcp.json`, or bootstrap file changes
- **THEN** the local refresh command updates one cachebuster, runs `codex plugin add`, validates the installed snapshot, and directs testing to a new Codex task

#### Scenario: Local marketplace root drifts
- **WHEN** refresh mode detects that `pein-local` points somewhere other than `/data/CoordExp/cc-plugin-codex`
- **THEN** it fails closed instead of silently refreshing from the wrong source; initial installation may explicitly rebind the marketplace once
