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

### Requirement: Fresh Codex discovery proves the cutover
Acceptance SHALL use a fresh Codex task after the new identity is installed. That task SHALL discover exactly the seven renamed Skills and seven renamed typed tools, spawn one explicit read-only Claude Agent through the new namespace, join its completion, perform one exact valid follow-up, and inspect list/message behavior. Acceptance SHALL also prove the old MCP server is not concurrently active. The witness SHALL not be replaced by checkout-only tests, marketplace metadata, or a zero exit code.

#### Scenario: Fresh task proves the renamed lifecycle
- **WHEN** the new Plugin is loaded after the atomic cutover
- **THEN** discovery, spawn, wait, exact follow-up, list, and message read all succeed only through `codex_harnessdock`

#### Scenario: Old and new servers are both visible
- **WHEN** the fresh task can discover or invoke both namespaces
- **THEN** cutover acceptance fails and the operator rolls back to one enabled identity

### Requirement: Phase-zero rename does not move source ownership
This identity transition SHALL continue loading the canonical production checkout at `/data/CoordExp/cc-plugin-codex` and MAY retain the development worktree `/data/CoordExp/cc-plugin-codex-dev`. It SHALL NOT rename Git repositories, registered worktrees, remotes, GitHub ownership, or historical records. A later separately specified physical rename SHALL update those boundaries only after the neutral control plane and OpenCode Driver are accepted.

#### Scenario: Runtime path is inspected after identity cutover
- **WHEN** doctor resolves the loaded source
- **THEN** the Plugin reports the current canonical checkout and does not claim that physical source paths were renamed

