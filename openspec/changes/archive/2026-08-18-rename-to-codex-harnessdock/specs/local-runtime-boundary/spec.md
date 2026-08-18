## MODIFIED Requirements

### Requirement: Checkout-owned executable runtime
The installed HarnessDock for Codex Plugin SHALL load executable runtime source only from the canonical `/data/CoordExp/cc-plugin-codex` checkout until the separately specified physical source rename is accepted. Both lifecycle and MCP bootstraps SHALL NOT accept caller or ambient runtime-checkout selection. They SHALL NOT load runtime or Git objects from `/data/CoordExp/external/cc-plugin-codex`, Sendbird, another upstream repository, a Git alternate, a registered development worktree, or a versioned Plugin Cache path.

#### Scenario: Matching independent checkout delegates successfully
- **WHEN** an installed lifecycle or MCP bootstrap validates `/data/CoordExp/cc-plugin-codex`
- **THEN** it delegates execution to that checkout's matching public runtime entrypoint while reporting the HarnessDock public identity

#### Scenario: Source root mismatch fails closed
- **WHEN** the loaded runtime source does not resolve to the canonical fixed checkout
- **THEN** the runtime refuses to execute and reports the source mismatch

#### Scenario: Development worktree provenance is inspected
- **WHEN** the canonical checkout's Git common directory and remotes are inspected
- **THEN** they resolve only to the independent local clone and its Pein2017 `origin`, with no upstream or external-repo dependency, and no development worktree becomes an executable runtime source
