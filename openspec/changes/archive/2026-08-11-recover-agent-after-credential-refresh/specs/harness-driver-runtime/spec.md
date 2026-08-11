## ADDED Requirements

### Requirement: Claude credential readiness is local, redacted, and generation-aware
The Claude Code Driver SHALL observe authentication only through the fixed Harness configuration identity and SHALL distinguish local credential presence from a live provider validation. For native OAuth credentials, it SHALL derive a versioned generation only from non-secret filesystem identity and expiry metadata. It SHALL NOT persist or expose access tokens, refresh tokens, token hashes, account identity, organization identity, scopes, raw credential content, or arbitrary environment values. Metadata-only readiness SHALL report `liveValidated: false` and SHALL NOT claim that a provider request has succeeded.

#### Scenario: Current native OAuth credentials are present
- **WHEN** the fixed Claude config contains a readable native OAuth credential record
- **THEN** readiness reports credential presence, bounded local expiry facts, a redacted generation, and `liveValidated: false` without launching a model

#### Scenario: Credential record contains secrets and identity
- **WHEN** the native credential record includes bearer tokens, scopes, email, organization, or other private fields
- **THEN** no readiness, job, Agent, completion, diagnostic, or error receipt contains those values or their hashes

#### Scenario: API key authentication is inherited
- **WHEN** Claude authentication is supplied by an inherited API-key environment value
- **THEN** readiness may report key presence but does not persist a key-derived generation or represent key rotation as automatically proven

#### Scenario: Authentication fails during a native turn
- **WHEN** Claude returns native evidence classified as `auth_or_permission`
- **THEN** the terminal result binds a fresh redacted credential observation to that failure without changing the failure class or claiming resumability

