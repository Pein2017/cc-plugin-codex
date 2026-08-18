## MODIFIED Requirements

### Requirement: Checkout-owned executable runtime
The installed HarnessDock for Codex Plugin SHALL load executable runtime source only from the canonical `/data/CoordExp/codex-harnessdock` checkout until the separately specified physical source rename is accepted. Both lifecycle and MCP bootstraps SHALL NOT accept caller or ambient runtime-checkout selection. They SHALL NOT load runtime or Git objects from `/data/CoordExp/external/cc-plugin-codex`, Sendbird, another upstream repository, a Git alternate, a registered development worktree, or a versioned Plugin Cache path.

#### Scenario: Matching independent checkout delegates successfully
- **WHEN** an installed lifecycle or MCP bootstrap validates `/data/CoordExp/codex-harnessdock`
- **THEN** it delegates execution to that checkout's matching public runtime entrypoint while reporting the HarnessDock public identity

#### Scenario: Source root mismatch fails closed
- **WHEN** the loaded runtime source does not resolve to the canonical fixed checkout
- **THEN** the runtime refuses to execute and reports the source mismatch

#### Scenario: Development worktree provenance is inspected
- **WHEN** the canonical checkout's Git common directory and remotes are inspected
- **THEN** they resolve only to the independent local clone and its Pein2017 `origin`, with no upstream or external-repo dependency, and no development worktree becomes an executable runtime source

### Requirement: Harness dependencies remain explicit behind checkout-owned Drivers
Each admitted Harness SHALL declare its host executable, native configuration/session identity, authentication boundary, compatibility detector, and redacted readiness evidence through its checkout-owned Driver. Those host components MAY remain external execution dependencies, but Driver source, registry, lifecycle orchestration, and durable state ownership SHALL remain inside `/data/CoordExp/codex-harnessdock`. No Driver SHALL load source or Git objects from upstream repositories, registered development worktrees, or versioned Plugin Cache paths.

#### Scenario: Claude Code Driver becomes ready
- **WHEN** the current registry validates its only admitted Driver
- **THEN** readiness identifies the host `claude` executable and fixed Claude configuration as external dependencies while all Driver and supervisor source resolves to the canonical checkout

#### Scenario: Future Harness CLI is unavailable
- **WHEN** an in-tree Driver cannot resolve or validate its declared host executable
- **THEN** readiness fails for that route without substituting a raw provider API, upstream package, Cache runtime, or another Harness

### Requirement: Exactly one environment file is selected
The installed model-facing lifecycle and MCP bootstraps SHALL load exactly `/data/CoordExp/codex-harnessdock/config/runtime.env`. They SHALL NOT select an environment from invocation arguments, MCP tool arguments, `CODEX_HARNESSDOCK_RUNTIME_ENV_FILE`, `${CODEX_HOME}/.env`, or a workspace `.codex/.env`. They SHALL parse the fixed file as data and SHALL NOT evaluate it as shell code.

#### Scenario: Ambient environment selectors conflict
- **WHEN** inherited `CODEX_HARNESSDOCK_RUNTIME_ENV_FILE`, `CODEX_HOME`, or workspace `.codex/.env` point to other files
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
- **WHEN** refresh or release mode detects that `pein-local` points somewhere other than `/data/CoordExp/codex-harnessdock`
- **THEN** it fails closed instead of silently refreshing from the wrong source; initial installation may explicitly rebind the marketplace once

### Requirement: Recent Plugin discovery shells survive version refresh
The local installer SHALL preserve an exact discovery-only shell for each
successfully installed version in bounded owner-local Plugin data outside the
volatile Codex Plugin Cache. Before changing Plugin state, it SHALL combine any
eligible cached shells with that durable archive, and after installation it
SHALL restore at most the two most-recent non-current versions. A retained shell
SHALL contain only the Plugin snapshot's discovery configuration, Skills, and
descriptor bootstraps, and all executable lifecycle operations SHALL still
resolve to `/data/CoordExp/codex-harnessdock`.

The installer SHALL retain bounded coverage metadata for the last successful
installed version. If that known predecessor differs from the requested version
and cannot be reconstructed from either the durable archive or the existing
Cache, refresh SHALL fail before invoking Codex instead of silently dropping the
active-task compatibility promise. An installation with no prior coverage
metadata MAY proceed as an explicitly reported first-install or migration case.

#### Scenario: Existing task references the immediately previous version
- **WHEN** a versioned local release causes Codex to remove previous Cache versions
- **THEN** the installer restores the recent previous discovery path from durable owner-local data so an existing task can resolve its exact Skill/bootstrap without using cached lifecycle source

#### Scenario: Previous Cache disappeared before refresh starts
- **WHEN** the known previous version is absent from Codex Cache but its durable discovery archive is valid
- **THEN** refresh restores that version after installing the current snapshot and reports it as retained

#### Scenario: Known predecessor has no valid shell
- **WHEN** coverage metadata names a non-current previous version that is absent or invalid in both durable owner-local data and Codex Cache
- **THEN** refresh fails before calling Codex and reports the missing version without deleting or replacing current Plugin state

#### Scenario: First managed installation has no predecessor evidence
- **WHEN** no coverage metadata or durable archive exists before installation
- **THEN** installation may proceed, explicitly reports that no predecessor coverage was available, and archives the successfully installed current discovery shell for the next upgrade

#### Scenario: More than two prior versions exist
- **WHEN** preservation selects compatibility shells from Cache and durable owner-local data
- **THEN** it restores at most the two most-recent non-current version directories and bounds the durable archive to the current version plus those two predecessors

#### Scenario: Installation fails after cleanup begins
- **WHEN** Codex Plugin installation fails after compatibility shells were staged
- **THEN** the installer attempts to restore the selected shells before reporting the installation failure and does not advance successful-install coverage metadata

#### Scenario: Historical cache contains executable runtime source
- **WHEN** a cached or archived version contains content outside the compatibility whitelist
- **THEN** that content is not copied into the durable archive or restored shell

### Requirement: Installed bootstraps report missing checkout dependencies actionably
Before starting a checkout runtime entrypoint, each installed lifecycle and MCP bootstrap SHALL verify that the canonical checkout can resolve the required production dependencies. A missing dependency SHALL fail with a bounded message that names `/data/CoordExp/codex-harnessdock` and instructs `npm install`, without exposing the generic Node module-loader stack as the primary error.

#### Scenario: Checkout node_modules is missing
- **WHEN** an installed bootstrap cannot resolve the MCP SDK or Zod from the canonical checkout
- **THEN** it starts no runtime entrypoint and reports the checkout-specific `npm install` recovery
