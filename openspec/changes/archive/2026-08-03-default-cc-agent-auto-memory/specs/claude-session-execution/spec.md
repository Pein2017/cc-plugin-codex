## ADDED Requirements

### Requirement: CC Agent turns enable native Auto Memory by default
Every model-facing Claude Code turn launched by the CC runtime SHALL receive
`CLAUDE_CODE_DISABLE_AUTO_MEMORY=0` from the canonical fixed environment so
Claude native Auto Memory is enabled for new and resumed Agent turns. The fixed
value SHALL override a conflicting inherited model-facing value. The runtime
SHALL NOT emulate Auto Memory with `CLAUDE.md`, prompt content, public receipts,
or Plugin-owned memory storage, and SHALL NOT set `autoMemoryDirectory`; Claude
SHALL retain its repository-derived memory isolation and shared-worktree
behavior.

#### Scenario: New CC Agent starts
- **WHEN** `spawn_agent` activates a new Claude Code turn
- **THEN** the Claude child environment contains `CLAUDE_CODE_DISABLE_AUTO_MEMORY=0`

#### Scenario: Durable Agent resumes
- **WHEN** `followup_task` activates a proven native Claude session
- **THEN** the resumed Claude child receives the same force-enabled Auto Memory environment

#### Scenario: Inherited host value disables Auto Memory
- **WHEN** the inherited model-facing environment contains `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`
- **THEN** the canonical fixed environment replaces it with `0` before Claude starts

#### Scenario: Claude selects memory storage
- **WHEN** Auto Memory is available to an Agent working in a Git repository or worktree
- **THEN** the Plugin passes no shared memory directory or memory content and Claude retains native repository-derived storage
