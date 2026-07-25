## ADDED Requirements

### Requirement: Claude runs through the headless streaming protocol
The runtime SHALL execute Claude Code with print mode, stream-json input and output, verbose partial messages, and hook events so that prompts, steering, session identity, output, tool use, and terminal receipts can be tracked.

#### Scenario: A tracked turn starts
- **WHEN** the supervisor launches a Claude attempt
- **THEN** the initial prompt is written through stdin and stream events are parsed into bounded runtime receipts

### Requirement: Safe execution profile applies explicit safeguards
The default safe profile SHALL apply the runtime-owned sandbox, permission policy, and model or effort defaults, and SHALL restrict tools for read-only work unless the caller supplies an explicit allowed-tool set.

#### Scenario: Read-only safe task starts
- **WHEN** a caller starts a safe task without write access or explicit allowed tools
- **THEN** Claude receives the read-only sandbox settings and bounded read-only tool policy

### Requirement: Terminal-parity profile avoids implicit Claude policy overrides
The terminal-parity profile SHALL inherit the selected environment and Claude configuration and SHALL NOT implicitly override model, effort, settings, permissions, tools, MCP configuration, or prompts. Explicit caller overrides SHALL be passed through and recorded.

#### Scenario: Terminal-parity uses no explicit overrides
- **WHEN** a terminal-parity task starts without model, effort, permission, or tool overrides
- **THEN** the runtime adds only transport and lifecycle requirements and reports no added Claude policy override

#### Scenario: Unrestricted permission is explicitly requested
- **WHEN** a terminal-parity caller explicitly requests dangerous permission bypass
- **THEN** the runtime sets `IS_SANDBOX=1`, passes `--dangerously-skip-permissions`, and records the override

### Requirement: Dangerous permission bypass is constrained
Dangerous permission bypass SHALL be accepted only with terminal-parity and SHALL NOT be combined with an explicit permission mode.

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
