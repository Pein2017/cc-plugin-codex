## MODIFIED Requirements

### Requirement: Initial Agent sessions have an explicit Claude display name
The runtime SHALL pass the durable Agent name through Claude's `--name` option when creating a new session, so Claude Code does not need an auxiliary model to generate an automatic title. Exact-session resumes SHALL retain the existing session identity without renaming it.

#### Scenario: Initial Agent turn starts
- **WHEN** a new Agent turn creates a fresh Claude session
- **THEN** Claude receives the Agent name through `--name` together with the selected canonical `claude-haiku-4-5`, `claude-sonnet-5`, `claude-opus-5`, or `claude-fable-5` model

#### Scenario: Exact session resumes
- **WHEN** a follow-up resumes an existing Claude session
- **THEN** the runtime uses the exact session ID without adding a new `--name` argument
