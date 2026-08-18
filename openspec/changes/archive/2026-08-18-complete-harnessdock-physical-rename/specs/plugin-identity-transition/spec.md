## MODIFIED Requirements

### Requirement: Phase-zero rename does not move source ownership
The phase-zero identity transition SHALL NOT itself rename the canonical production checkout, Git common directory, remotes, GitHub ownership, or historical records; those boundaries move only in the separately specified physical relocation below, after the neutral control plane and OpenCode Driver are accepted. After that relocation, the canonical production checkout SHALL be `/data/CoordExp/codex-harnessdock` on branch `main` and the sole development worktree SHALL be `/data/CoordExp/codex-harnessdock-dev` on branch `developer`.

#### Scenario: Runtime path is inspected after identity cutover
- **WHEN** doctor resolves the loaded source
- **THEN** the Plugin reports the current canonical checkout truthfully and does not claim a physical path that has not landed

## ADDED Requirements

### Requirement: Physical relocation preserves history and resets durable state once
The physical rename SHALL relocate the live checkout by one filesystem move plus worktree repair on the existing Git common directory — never a fresh clone — and SHALL rename the GitHub repository in place so prior URLs redirect. The superseded old-name development worktree and the reference-only external clone SHALL be removed only after the `developer` branch is rehomed to the successor worktree. Under explicit user authorization, durable Agent state SHALL be reset exactly once: one fresh backup archive, a hard verification that zero Agents are active or unknown, then removal and fresh creation of the data namespace with the reset timestamp recorded beside the backup. No compatibility reader for pre-reset identifiers SHALL be added, and the MCP API generation SHALL NOT change for the rename alone.

#### Scenario: Live checkout is relocated
- **WHEN** the operator moves the live checkout to `/data/CoordExp/codex-harnessdock` and runs worktree repair
- **THEN** the shared Git common directory, branches, and gated promotion continue to work at the new paths without re-cloning

#### Scenario: Reset is attempted with active work
- **WHEN** any Agent is active or any version-three job record is unknown at reset time
- **THEN** the reset stops before removing anything and reports the blocking evidence

#### Scenario: Old-name surfaces after relocation
- **WHEN** a tracked source, script, plugin, or test file outside the historical allowlist references the retired checkout path, `CC_` variable, or `cc-agent-` prefix
- **THEN** the repo-wide guard fails the check suite naming the file
