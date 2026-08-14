## RENAMED Requirements

- FROM: `Typed activation exposes one write intent`
- TO: `Typed activation exposes one immutable behavioral authority`

## MODIFIED Requirements

### Requirement: Plugin exposes one typed HarnessDock MCP server
The installed Plugin SHALL declare one required local stdio MCP server named `codex_harnessdock`. The server SHALL expose exactly `spawn_agent`, `send_message`, `followup_task`, `wait_agent`, `interrupt_agent`, `list_agents`, `read_agent_messages`, and `list_harnesses`, with strict operation-specific input schemas and no generic command, terminal, job, cancellation, deletion, cross-root, native-session, executable, endpoint, credential, or Driver-module tool.

#### Scenario: Codex loads the new generation
- **WHEN** the selected Plugin MCP server initializes successfully
- **THEN** its tool catalog contains exactly the eight canonical snake_case operations

#### Scenario: Caller supplies an unknown field
- **WHEN** a tool call contains a field outside that operation's public schema
- **THEN** the call fails before durable runtime state or Harness service state changes

### Requirement: Typed spawn schema exposes only lead decisions
The typed `spawn_agent` schema SHALL require `task_name`, `message`, exact admitted `harness`, explicit full `model`, explicit `topology`, and boolean `write`. It SHALL expose only optional `description` and Driver-discriminated `reasoning_effort`. The typed `followup_task` schema SHALL expose only `target`, `message`, and optional Driver-admitted `reasoning_effort`; it SHALL inherit every immutable route field and SHALL NOT accept authority mutation. Both SHALL reject `allowed_tools`, `scope`, and `questions`; spawn SHALL also reject `delegation_mode`, `fork_turns`, `execution_profile`, working-directory, environment-file, instance, endpoint, credential, native-session, permission-mode, and dangerous-bypass fields as unknown public inputs.

#### Scenario: Minimal explicit Claude spawn is submitted
- **WHEN** Codex supplies task name, message, `harness=claude-code`, exact Claude model, explicit topology, and explicit write boolean
- **THEN** typed validation accepts the request without an instance, profile, tool list, or execution selector

#### Scenario: Minimal explicit OpenCode spawn is submitted
- **WHEN** Codex supplies task name, message, `harness=opencode`, model `opencode-go/deepseek-v4-flash`, `topology=leaf`, and `write=false`
- **THEN** typed validation passes the exact route to Driver validation without inferring any field

#### Scenario: Harness or topology is omitted
- **WHEN** spawn lacks either required field even when only one route appears ready
- **THEN** typed validation rejects the call before readiness or durable mutation

#### Scenario: Follow-up attempts a route or authority field
- **WHEN** follow-up supplies `harness`, `model`, `topology`, or `write`
- **THEN** strict validation rejects it before mailbox mutation

#### Scenario: Caller supplies repository policy fields
- **WHEN** spawn or follow-up supplies generic `scope` or `questions`
- **THEN** strict validation rejects them and Codex places any task-specific constraints in the bounded message instead

### Requirement: Typed activation exposes one immutable behavioral authority
The typed `spawn_agent` tool SHALL require boolean `write`, which maps once to `behavioral_read_only` or `behavioral_write` on the immutable Agent route. False SHALL impose the strongest reviewed Driver-specific no-mutation boundary and truthfully report its enforcement; true SHALL be admitted only by routes that support mutation. `followup_task` SHALL inherit this value and expose no permission switch. The MCP adapter SHALL NOT reinterpret authority, grant a Driver permission, or claim a filesystem sandbox.

#### Scenario: Read-only OpenCode activation is requested
- **WHEN** the exact Explorer route supplies `write: false`
- **THEN** the runtime freezes behavioral read-only authority and validates the configured Explorer profile before session creation

#### Scenario: Follow-up omits authority
- **WHEN** any v3 Agent receives a valid follow-up
- **THEN** the turn inherits the Agent's immutable authority rather than the latest job or a default

## ADDED Requirements

### Requirement: list_harnesses exposes admitted route facts without selecting one
`list_harnesses` SHALL accept no model-facing arguments and SHALL return every statically admitted Harness, each bounded logical-instance readiness, `liveValidated`, Driver/capability maturity, and safely discoverable exact route constraints. It SHALL not start model work, mutate lifecycle state, choose a route, expose endpoint/credential/configuration identity, or imply that an unavailable Harness is removed from the static registry.

#### Scenario: OpenCode Server is unavailable
- **WHEN** Codex lists Harnesses
- **THEN** the response includes `opencode` as admitted but unavailable and leaves `claude-code` facts independent

### Requirement: MCP receipts preserve immutable route lineage
Spawn, list, targeted wait/barrier, completion, blocking, and Harness listing receipts SHALL expose only the bounded public Harness, full model, topology, behavioral authority, and maturity facts needed to distinguish routes. They SHALL exclude native session IDs, instance keys, endpoints, credentials, jobs, raw capability receipts, and private Server errors. The same model string under another Harness SHALL remain a distinct lineage.

#### Scenario: Mixed-Harness Agents are listed
- **WHEN** one root owns Claude and OpenCode Agents
- **THEN** each Agent card identifies its immutable public route without exposing native identities

### Requirement: Public generation changes once for the unified surface
The addition of required Harness/topology fields, immutable authority, route-qualified receipts, and `list_harnesses` SHALL use one new MCP API generation. An older MCP process SHALL fail with the current HarnessDock restart-required error before any operation, and acceptance SHALL require a versioned refresh and new Codex task. No intermediate generation SHALL expose defaulted or partially explicit multi-Harness spawn.

#### Scenario: Old task invokes list or spawn
- **WHEN** its MCP process generation predates the unified surface
- **THEN** the checkout performs no lifecycle operation and returns the restart-required instruction
