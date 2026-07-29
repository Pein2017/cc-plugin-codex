# local-runtime-boundary Specification

## Purpose

Define the checkout-owned runtime, host Claude dependency, environment selection, and portability boundary.
## Requirements
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

### Requirement: Host Claude Code dependency is explicit
The runtime SHALL use the host `claude` CLI for authentication, Claude configuration, sessions, hooks, memories, skills, plugins, MCP configuration, and tool execution.

#### Scenario: Claude CLI is unavailable
- **WHEN** the configured Claude executable cannot be resolved
- **THEN** readiness fails without substituting an upstream package or cached runtime

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

### Requirement: Local development separates checkout edits from Plugin discovery refresh
Executable runtime source SHALL remain checkout-owned and SHALL NOT require Plugin uninstall/reinstall. A compatible change behind `runtime/index.mjs` SHALL load in a fresh isolated module graph on the next accepted MCP call, including from an already-running MCP server. The long-lived MCP protocol adapter, Plugin Skills, manifest, `.mcp.json`, annotations, and tool schemas SHALL remain task snapshots and SHALL NOT be claimed to hot-reload. Same-generation discovery edits SHALL use an in-place local refresh without changing the manifest version. An incompatible public MCP generation or release SHALL use a versioned local release refresh and a new Codex task.

#### Scenario: Compatible runtime changes during an existing MCP task
- **WHEN** a module behind `runtime/index.mjs` changes without changing the MCP API generation
- **THEN** the next accepted lifecycle call uses the revised checkout module graph without reinstalling the Plugin or restarting the task

#### Scenario: Same-generation discovery file changes
- **WHEN** a Skill, metadata, manifest content, `.mcp.json`, annotation, or bootstrap changes without a public generation change
- **THEN** `refresh:local` reinstalls the same manifest version and acceptance of the discovery change uses a new Codex task

#### Scenario: Public generation changes
- **WHEN** a stale MCP process calls a checkout whose public MCP API generation differs from the generation captured at server startup
- **THEN** the call performs no lifecycle operation and reports that a versioned refresh and new Codex task are required

#### Scenario: Versioned local release
- **WHEN** the operator intentionally runs the versioned local release command
- **THEN** it updates exactly one cachebuster, installs the resulting snapshot, and directs schema/Skill acceptance to a new task

#### Scenario: Local marketplace root drifts
- **WHEN** refresh or release mode detects that `pein-local` points somewhere other than `/data/CoordExp/cc-plugin-codex`
- **THEN** it fails closed instead of silently refreshing from the wrong source; initial installation may explicitly rebind the marketplace once

### Requirement: Recent Plugin discovery shells survive version refresh
The local installer SHALL preserve and restore at most two most-recent non-current installed version directories across Codex Plugin cleanup. A retained directory SHALL contain only the Plugin snapshot's discovery configuration, Skills, and descriptor bootstraps, and all executable lifecycle operations SHALL still resolve to `/data/CoordExp/cc-plugin-codex`.

#### Scenario: Existing task references the immediately previous version
- **WHEN** a versioned local release causes Codex to remove previous Cache versions
- **THEN** the installer restores the recent previous discovery path so an existing task can resolve its Skill/bootstrap without using cached lifecycle source

#### Scenario: More than two prior versions exist
- **WHEN** preservation selects compatibility shells before installation
- **THEN** it retains at most the two most-recent non-current version directories and does not create an unbounded archive

#### Scenario: Installation fails after cleanup begins
- **WHEN** Codex Plugin installation fails after compatibility shells were backed up
- **THEN** the installer attempts to restore the selected shells before reporting the installation failure

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

### Requirement: Installed bootstraps report missing checkout dependencies actionably
Before starting a checkout runtime entrypoint, each installed lifecycle and MCP bootstrap SHALL verify that the canonical checkout can resolve the required production dependencies. A missing dependency SHALL fail with a bounded message that names `/data/CoordExp/cc-plugin-codex` and instructs `npm install`, without exposing the generic Node module-loader stack as the primary error.

#### Scenario: Checkout node_modules is missing
- **WHEN** an installed bootstrap cannot resolve the MCP SDK or Zod from the canonical checkout
- **THEN** it starts no runtime entrypoint and reports the checkout-specific `npm install` recovery

### Requirement: Plugin discovery version derives from package metadata
Local cachebuster refresh SHALL read the base release version from the canonical checkout `package.json`, replace any stale Plugin manifest base, and append exactly one `+codex.<cachebuster>` suffix. Initial installation SHALL validate the same relationship before calling Codex.

#### Scenario: Manifest base drift exists before refresh
- **WHEN** the Plugin manifest base differs from `package.json`
- **THEN** cachebuster refresh replaces it with the package base instead of preserving the stale value

#### Scenario: Install sees unsynchronized version metadata
- **WHEN** initial or refresh installation sees a Plugin base that does not match the package base
- **THEN** installation fails before changing Codex Plugin state
