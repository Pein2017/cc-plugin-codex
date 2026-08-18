## Purpose

Define one truthful, reversible public identity transition from CC for Pein to HarnessDock for Codex without splitting runtime ownership, Agent state, or installed discovery.

## ADDED Requirements

### Requirement: One canonical HarnessDock identity is used across public surfaces
The Plugin SHALL use display name `HarnessDock for Codex`, Plugin and Skill namespace `codex-harnessdock`, MCP server namespace `codex_harnessdock`, and runtime package/bin name `codex-harnessdock-runtime`. Public metadata SHALL identify Pein2017 by public handle/link, declare Apache-2.0, omit private email, and state that the Plugin is an unofficial third-party project not affiliated with or endorsed by OpenAI. These names SHALL remain consistent across manifests, package metadata, discovery, Skills, typed tools, receipts, documentation, doctor output, and local refresh/release tooling.

#### Scenario: New identity is inspected
- **WHEN** checkout and installed metadata are validated after cutover
- **THEN** every public identity field uses the canonical HarnessDock values and no distributable metadata exposes a private email

#### Scenario: Old public namespace remains in an active surface
- **WHEN** a current manifest, Skill, MCP server, bootstrap, doctor result, or model-facing receipt still advertises `cc-for-pein` or `cc_for_pein`
- **THEN** identity acceptance fails before the new Plugin is treated as ready

### Requirement: Identity cutover preserves one runtime and one state lineage
The local cutover SHALL drain active Agents, preserve a recoverable backup of the existing local runtime state, switch discovery to the new identity, and continue using the same logical Agent/job/mailbox/completion/native-session lineage. The old and new MCP servers SHALL NOT be enabled concurrently, and the cutover SHALL NOT duplicate or rewrite durable lifecycle records into a second store.

#### Scenario: Old Agent state exists before cutover
- **WHEN** the operator performs the identity transition with no active turn
- **THEN** the new identity can inspect and control the same valid stored Agent lineage without converting its Harness/session meaning

#### Scenario: Active Agent prevents cutover
- **WHEN** any Agent turn is active or settlement is unknown
- **THEN** the cutover stops before enabling the new identity or removing the old entry

### Requirement: Candidate acceptance and installed cutover acceptance are distinct
Checkout-level identity, parity, migration, and fake-Claude tests plus fresh read-only review SHALL be sufficient to candidate-accept the rename for dependent Phase A/B implementation while the old Plugin remains installed. Installed cutover acceptance SHALL still use a fresh Codex task after the final accepted HarnessDock generation is installed. That task SHALL discover the exact operation catalog owned by the final generation, prove the required legacy-Claude lifecycle through the new namespace, and prove the old MCP server is not concurrently active. When Phase B is included before installation, the expected catalog is its eight-operation generation rather than the intermediate seven-operation catalog. The installed witness SHALL not be replaced by checkout-only tests, marketplace metadata, or a zero exit code.

#### Scenario: Dependent implementation starts before installation
- **WHEN** the exact rename candidate passes all checkout-level gates and review but the installed identity remains `cc_for_pein`
- **THEN** Phase A and Phase B candidate implementation may proceed without claiming that the rename is installed or release-accepted

#### Scenario: Fresh task proves the final renamed lifecycle
- **WHEN** the final accepted Plugin generation is loaded after the atomic cutover
- **THEN** its exact catalog and required legacy-Claude lifecycle succeed only through `codex_harnessdock`

#### Scenario: Old and new servers are both visible
- **WHEN** the fresh task can discover or invoke both namespaces
- **THEN** cutover acceptance fails and the operator rolls back to one enabled identity

### Requirement: Phase-zero rename does not move source ownership
This identity transition SHALL continue loading the canonical production checkout at `/data/CoordExp/cc-plugin-codex` and MAY use `/data/CoordExp/codex-harnessdock-dev` as the successor development worktree. It SHALL NOT rename the canonical production checkout, Git common directory, remotes, GitHub ownership, or historical records. A later separately specified physical rename SHALL update those production/deployment boundaries only after the neutral control plane and OpenCode Driver are accepted.

#### Scenario: Runtime path is inspected after identity cutover
- **WHEN** doctor resolves the loaded source
- **THEN** the Plugin reports the current canonical checkout and does not claim that physical source paths were renamed
