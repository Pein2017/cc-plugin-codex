## MODIFIED Requirements

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

## ADDED Requirements

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
