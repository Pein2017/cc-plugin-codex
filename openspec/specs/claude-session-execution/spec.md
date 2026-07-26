# claude-session-execution Specification

## Purpose

Define Claude Code headless transport, execution profiles, session capture, and exact-session continuation.

## Requirements

### Requirement: Claude runs through the headless streaming protocol
The runtime SHALL execute Claude Code with print mode, stream-json input and output, verbose partial messages, and hook events so that prompts, steering, session identity, output, tool use, and terminal receipts can be tracked.

#### Scenario: A tracked turn starts
- **WHEN** the supervisor launches a Claude attempt
- **THEN** the initial prompt is written through stdin and stream events are parsed into bounded runtime receipts

### Requirement: Safe execution profile applies explicit safeguards
The explicit opt-in safe profile SHALL apply the runtime-owned sandbox and permission policy and SHALL restrict tools for read-only work unless the caller supplies an explicit allowed-tool set. It SHALL still require the caller-selected supported model inherited from the Agent request.

#### Scenario: Read-only safe task starts
- **WHEN** a caller starts a safe task without write access or explicit allowed tools
- **THEN** Claude receives the read-only sandbox settings, bounded read-only tool policy, and caller-selected supported model

### Requirement: Default terminal-parity profile launches Claude with full access
The default terminal-parity profile SHALL inherit Claude settings, hooks, memories, skills, plugins, MCP configuration, tools, and prompts while requiring the explicit supported model from `spawn_agent`. Before launching Claude it SHALL set the effective `CLAUDE_CONFIG_DIR`, set `IS_SANDBOX=1`, and pass `--dangerously-skip-permissions`. It SHALL NOT add model fallback, effort, settings, tool, MCP, or prompt overrides that the caller did not request.

#### Scenario: Default full-access Agent starts
- **WHEN** `spawn_agent` supplies a supported model and omits an execution profile
- **THEN** Claude receives the selected config directory, `IS_SANDBOX=1`, `--dangerously-skip-permissions`, and the explicit model without other implicit Claude policy overrides

#### Scenario: Native Claude customizations are configured
- **WHEN** the selected Claude config enables hooks, Serena MCP, memories, plugins, or skills
- **THEN** terminal-parity leaves those native configuration sources enabled rather than replacing them with runtime-owned settings

### Requirement: Initial Agent sessions have an explicit Claude display name
The runtime SHALL pass the durable Agent name through Claude's `--name` option
when creating a new session, so Claude Code does not need an auxiliary model to
generate an automatic title. Exact-session resumes SHALL retain the existing
session identity without renaming it.

#### Scenario: Initial Agent turn starts
- **WHEN** a new Agent turn creates a fresh Claude session
- **THEN** Claude receives the Agent name through `--name` together with the
  selected `claude-sonnet-5` or `claude-opus-5` model

#### Scenario: Exact session resumes
- **WHEN** a follow-up resumes an existing Claude session
- **THEN** the runtime uses the exact session ID without adding a new `--name`
  argument

### Requirement: Dangerous permission bypass is constrained
The default terminal-parity profile SHALL always use dangerous permission bypass and SHALL NOT combine it with an explicit permission mode. The safe profile SHALL reject dangerous permission bypass.

#### Scenario: Default terminal-parity Agent starts
- **WHEN** a caller starts an Agent without selecting an execution profile
- **THEN** the runtime selects terminal-parity and applies dangerous permission bypass

#### Scenario: Explicit permission mode conflicts with terminal parity
- **WHEN** a terminal-parity caller supplies an explicit permission mode
- **THEN** the runtime rejects the request before launching Claude

#### Scenario: Dangerous bypass is requested in safe mode
- **WHEN** a caller combines dangerous permission bypass with the safe profile
- **THEN** the runtime rejects the request before launching Claude

### Requirement: Claude session identity is captured and resumable
The runtime SHALL preserve Claude Code session persistence by default, capture the Claude session ID from protocol events or results, and use `--resume` with that exact ID for recovery or follow-up.

#### Scenario: New Claude session completes
- **WHEN** Claude reports a session ID during a new tracked job
- **THEN** the job receipt stores that Claude session ID independently from the Codex owner session ID

#### Scenario: Exact-session follow-up starts
- **WHEN** a caller follows up on a resumable terminal job
- **THEN** the new attempt invokes Claude with the recorded Claude session ID and rejects observed session drift

### Requirement: Session ownership is sequential
The runtime SHALL prevent concurrent plugin workers from owning the same canonical `CLAUDE_CONFIG_DIR` and Claude session ID.

#### Scenario: A second worker requests an actively leased session
- **WHEN** a session lease is held by another active plugin job
- **THEN** the second request fails without launching a competing Claude owner
