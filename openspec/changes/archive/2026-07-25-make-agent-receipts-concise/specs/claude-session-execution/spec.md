## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Terminal-parity profile avoids implicit Claude policy overrides
The terminal-parity profile SHALL inherit the selected environment and Claude
configuration while enforcing the plugin-wide exact model constraint. It SHALL
explicitly use either `claude-sonnet-5` or `claude-opus-5`, defaulting to Opus
5 when the caller omits a model, and SHALL NOT implicitly override effort,
settings, permissions, tools, MCP configuration, or prompts. Explicit caller
overrides SHALL be passed through and recorded.

#### Scenario: Terminal-parity uses no explicit overrides
- **WHEN** a terminal-parity task starts without model, effort, permission, or
  tool overrides
- **THEN** the runtime adds only transport and lifecycle requirements plus the
  exact `claude-opus-5` default and reports no other Claude policy override

#### Scenario: Unrestricted permission is explicitly requested
- **WHEN** a terminal-parity caller explicitly requests dangerous permission
  bypass
- **THEN** the runtime sets `IS_SANDBOX=1`, passes
  `--dangerously-skip-permissions`, pins the selected supported model, and
  records the overrides
