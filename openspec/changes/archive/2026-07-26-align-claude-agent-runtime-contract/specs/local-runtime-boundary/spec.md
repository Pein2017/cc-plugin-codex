## MODIFIED Requirements

### Requirement: Checkout-owned executable runtime
The installed CC for Pein plugin SHALL load executable runtime source only from the configured independent Pein2017 clone or its registered worktree. It SHALL NOT load runtime or Git objects from `/data/CoordExp/external/cc-plugin-codex`, Sendbird, another upstream repository, a Git alternate, or a versioned plugin Cache path.

#### Scenario: Matching independent checkout delegates successfully
- **WHEN** the installed bootstrap resolves `CC_RUNTIME_CHECKOUT` to the standalone Pein2017 clone or its registered worktree
- **THEN** it delegates execution to that checkout's public runtime entrypoint

#### Scenario: Source root mismatch fails closed
- **WHEN** the configured checkout and loaded runtime source resolve to different canonical paths
- **THEN** the runtime refuses to execute and reports the source mismatch

#### Scenario: Development worktree provenance is inspected
- **WHEN** the release worktree's Git common directory and remotes are inspected
- **THEN** they resolve only to the independent local clone and its Pein2017 `origin`, with no upstream or external-repo dependency

### Requirement: Runtime environment preserves required host settings
The selected environment SHALL carry uppercase and lowercase proxy variables, no-proxy variables, `CONDA_EXE`, `PATH`, and other valid inherited or file-defined values to the Claude subprocess. The effective `CLAUDE_CONFIG_DIR` SHALL be selected from non-empty `CLAUDE_NATIVE_CONFIG_DIR`, then non-empty `CLAUDE_CONFIG_DIR`, then `/data/CoordExp/.claude`. Receipts SHALL expose only the effective config path and redacted network endpoints, not arbitrary environment values.

#### Scenario: Native Claude config override is present
- **WHEN** `CLAUDE_NATIVE_CONFIG_DIR` is non-empty
- **THEN** the Claude child receives that canonical value as `CLAUDE_CONFIG_DIR`

#### Scenario: Native override is absent
- **WHEN** `CLAUDE_NATIVE_CONFIG_DIR` is empty or absent
- **THEN** the Claude child uses configured `CLAUDE_CONFIG_DIR` or the defined local default

#### Scenario: Proxy and Claude config are recorded safely
- **WHEN** readiness or execution emits an environment receipt
- **THEN** it identifies the effective Claude config directory and redacted proxy endpoints without recording proxy credentials or unrelated environment values

## ADDED Requirements

### Requirement: Local development separates runtime hot updates from plugin discovery refresh
Executable runtime changes SHALL take effect directly from `CC_RUNTIME_CHECKOUT` without uninstalling or reinstalling the plugin. Changes to plugin skills, skill metadata, manifest, or bootstrap SHALL be refreshed by atomically adding the current local plugin snapshot without first removing the plugin or a correctly bound marketplace.

#### Scenario: Runtime implementation changes
- **WHEN** a runtime module changes under the configured checkout
- **THEN** the next lifecycle invocation executes that new module without a plugin refresh

#### Scenario: Skill metadata changes
- **WHEN** a skill, skill metadata, manifest, or bootstrap file changes
- **THEN** the local refresh command updates one cachebuster, runs `codex plugin add`, validates the installed snapshot, and directs testing to a new Codex task

#### Scenario: Local marketplace root drifts
- **WHEN** refresh mode detects that `pein-local` points somewhere other than the current independent clone
- **THEN** it fails closed instead of silently refreshing from the wrong source; initial installation may explicitly rebind the marketplace once
