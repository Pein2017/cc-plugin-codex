## RENAMED Requirements
- FROM: `CC Agent turns enable native Auto Memory by default`
- TO: `Claude Agent turns enable native Auto Memory by default`

## MODIFIED Requirements

### Requirement: Claude Agent turns enable native Auto Memory by default
Every model-facing Claude Code turn launched by the CC runtime SHALL receive
`CLAUDE_CODE_DISABLE_AUTO_MEMORY=0` from the canonical effective environment
after the one env file is resolved, so a selected file cannot accidentally
omit or disable it. The runtime SHALL NOT emulate Auto Memory with `CLAUDE.md`,
prompt content, public receipts, or Plugin-owned memory storage, and SHALL NOT
set `autoMemoryDirectory`. Claude SHALL retain its repository-derived memory
isolation and shared-worktree behavior. Native teammate `memory: local` SHALL
remain Claude-owned at `.claude/agent-memory-local/<member-type>/`.

#### Scenario: Inherited or selected value disables Auto Memory
- **WHEN** inherited environment or the selected env file contains `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`, or omits the setting
- **THEN** the canonical effective child environment replaces it with `0` before Claude starts

#### Scenario: New Claude Agent starts
- **WHEN** `spawn_agent` activates a new Claude Code turn
- **THEN** the Claude child environment contains `CLAUDE_CODE_DISABLE_AUTO_MEMORY=0`

#### Scenario: Inherited host value disables Auto Memory
- **WHEN** the inherited model-facing environment contains `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`
- **THEN** the canonical effective environment replaces it with `0` before Claude starts

#### Scenario: Claude selects memory storage
- **WHEN** Auto Memory is available to an Agent working in a Git repository or worktree
- **THEN** the Plugin passes no shared memory directory or memory content and Claude retains native repository-derived storage

#### Scenario: Durable Agent resumes
- **WHEN** a follow-up activates a proven parent Claude session
- **THEN** the resumed parent and any fresh native teammates receive the same force-enabled Auto Memory environment

### Requirement: Runtime appends a bounded delegation envelope
Every public Claude turn SHALL receive a runtime-owned
`--append-system-prompt` envelope without replacing Claude's native system
prompt. The common envelope SHALL identify the turn as a bounded delegation
from the Codex lead, preserve the supplied task/workspace boundary, state the
current activation's write intent as behavioral authority, assign user-facing
synthesis and final acceptance to Codex, require one self-contained result,
and require an exact blocker question with evidence when a reserved decision is
needed. False write intent SHALL forbid task/workspace/repository/external
mutation except explicitly identified native local-memory maintenance; true
write intent SHALL permit only task-scoped mutation. Every mode SHALL emit the
reviewed deny list for `Workflow`, machine-global discovery, scheduled/routine
wakeups, user/notification delivery, and native worktree switching. Leaf mode
SHALL additionally deny `Agent` and `SendMessage`. Orchestrator mode SHALL make
the Native Agent Teams coordination surface available only under the approved
team contract, require named pinned teammate definitions and disjoint write
surfaces, forbid isolation/forks/cross-session recipients in the prompt, and
require the lead to join, verify, and synthesize the team. The envelope SHALL
label prompt-governed recipient, role, write, team-size, and cost budgets as
behavioral rather than process-enforced.

#### Scenario: Read-intent leaf turn starts
- **WHEN** an Agent activates in leaf mode with `write: false`
- **THEN** Claude receives the common read-only behavioral instruction and leaf instruction plus hard native delegation, Workflow, and SendMessage tool denials

#### Scenario: Write-intent leaf turn starts
- **WHEN** an eligible non-Haiku Agent activates in leaf mode with `write: true`
- **THEN** Claude receives task-scoped mutation authority and the same leaf containment boundary

#### Scenario: Native team lead starts
- **WHEN** an eligible Opus or Fable Agent activates in `claude_orchestrator` mode
- **THEN** Claude receives the current authority and explicit experimental Native Agent Team instructions while Workflow, machine-global discovery, isolation, forks, and cross-session recipients remain forbidden by the stated enforcement layer

#### Scenario: Fable orchestrator starts
- **WHEN** a `claude-fable-5` Agent activates in `claude_orchestrator` mode
- **THEN** Claude receives the current authority and explicit experimental Native Agent Team instructions with the same reviewed enforcement boundaries

#### Scenario: Lead-owned decision blocks progress
- **WHEN** Claude cannot continue without a decision reserved to the Codex lead or user
- **THEN** the envelope instructs Claude to end the turn with the precise question and supporting evidence so the same durable Claude Agent can receive a follow-up

#### Scenario: Leaf transport reconnects
- **WHEN** bounded transport recovery reconnects a leaf job in the exact parent Claude session
- **THEN** the same delegation mode, tool denials, authority, and leaf envelope are reconstructed from durable job evidence

#### Scenario: Exact job reconnects
- **WHEN** bounded transport recovery reconnects the same leaf Agent job
- **THEN** the same delegation mode, tool denials, authority, and leaf envelope are reconstructed from that durable job evidence

#### Scenario: Native team transport closes
- **WHEN** an orchestrator process loses transport while native teammates may still have in-process state
- **THEN** the runtime does not automatically reconnect that same team turn and instead preserves the parent session evidence for a later explicit follow-up that forms a fresh team

#### Scenario: Follow-up changes write intent
- **WHEN** a follow-up activates the same parent Claude session with a new explicit write intent
- **THEN** the new job receives a fresh native team and envelope for the new intent without changing durable Claude Agent identity

#### Scenario: Native Claude customizations exist
- **WHEN** hooks, memories, skills, plugins, Serena MCP, or other native configuration is enabled
- **THEN** the runtime appends its bounded envelope rather than replacing or disabling Claude's native system and configuration sources
