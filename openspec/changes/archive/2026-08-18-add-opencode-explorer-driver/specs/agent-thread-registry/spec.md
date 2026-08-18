## ADDED Requirements

### Requirement: Public multi-Harness spawn activates version-three records
After the new MCP generation is active, every successful new Claude or OpenCode spawn SHALL write a version-3 Agent using the complete explicit route. The runtime SHALL NOT write a v3 Agent from a legacy or stale public schema, and SHALL NOT default any route field from the sole available Driver, Agent profile, model prefix, prior spawn, or configuration.

#### Scenario: New Claude Agent starts
- **WHEN** a current-generation caller explicitly supplies Claude Harness, exact model, topology, and write authority
- **THEN** a v3 Claude Agent is created while historical v1/v2 Agents remain unchanged

#### Scenario: Stale MCP omits Harness or topology
- **WHEN** a pre-generation tool process attempts spawn against the newer checkout
- **THEN** generation validation fails before lifecycle mutation and instructs a versioned refresh/new Codex task

### Requirement: OpenCode session binding is root and Agent scoped
Each accepted OpenCode session SHALL bind canonical `(opencode, instanceKey, sessionID)` plus authoritative session/incarnation evidence to one trusted Codex root and one Plugin Agent. Session binding SHALL remain distinct from every native turn reference and SHALL not prove prompt acceptance or settlement. Only a terminal follow-up on that exact Agent MAY reuse the session, and only when the route advertises `exact_resume` from authoritative revalidation. Raw session IDs, origin digests, foreign/unbound sessions, another Agent's session, and uncertain post-restart sessions SHALL not be adopted through model-facing or operator lifecycle calls.

#### Scenario: Another root observes the session ID text
- **WHEN** it attempts to resume or read that OpenCode session
- **THEN** root isolation rejects the operation without exposing native history or mutating the binding

#### Scenario: Session is valid but turn reference is absent
- **WHEN** an Agent has a bound session but no exact native turn identity for the latest attempt
- **THEN** the runtime does not treat the prompt as accepted, completed, or resumable from session existence alone
