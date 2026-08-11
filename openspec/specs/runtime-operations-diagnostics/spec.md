# runtime-operations-diagnostics Specification

## Purpose

Define redacted, read-only operator health and storage diagnostics without expanding the model-facing Agent API.
## Requirements
### Requirement: One operator doctor reports actionable health
The checkout SHALL provide one Linux operator command that evaluates checkout identity, installed Plugin parity, required Node dependencies, Claude CLI availability and static compatibility, Claude authentication, the fixed config/proxy envelope, exactly seven MCP tools, and storage health. Each check SHALL return a stable identifier, bounded status, redacted summary, and actionable recovery when failed. The command SHALL NOT be exposed through Plugin Skills or MCP tools.

#### Scenario: All required surfaces are healthy
- **WHEN** the operator runs doctor from the canonical checkout with the matching Plugin installed
- **THEN** it exits successfully and reports every required check as passed or advisory

#### Scenario: Required dependency is absent
- **WHEN** the MCP SDK or Zod cannot be resolved from the canonical checkout
- **THEN** doctor fails with an instruction to run `npm install` in `/data/CoordExp/cc-plugin-codex`

### Requirement: Diagnostic output is redacted and read-only
Doctor SHALL NOT expose credentials, email, organization identity, raw authentication output, proxy credentials, arbitrary environment values, message bodies, prompts, or Claude session contents. It SHALL NOT reconcile lifecycle state, acknowledge completion, prune jobs, acquire a session lease, launch a model, or otherwise mutate Agent/runtime/Claude state.

#### Scenario: Auth status contains private identity
- **WHEN** Claude returns authentication metadata including account or organization fields
- **THEN** doctor reports only bounded login/method/provider/subscription facts and omits private identity fields

#### Scenario: Runtime state is malformed
- **WHEN** storage diagnosis encounters an unreadable or invalid control record
- **THEN** it counts the malformed artifact as a warning without rewriting or deleting it

### Requirement: Storage inventory separates runtime and Claude retention
Doctor SHALL report aggregate Agent registry, job status, completion inbox, runtime artifact, and Claude session-history facts. Cleanup candidates SHALL be dry-run only and limited to conservative Plugin-owned stale temporary/reservation artifacts and terminal job receipts beyond the existing retention boundary. Claude history SHALL be reported separately under a 30-day observation window and SHALL never appear in Plugin cleanup candidates.

#### Scenario: Old Claude history exists
- **WHEN** Claude session JSONL artifacts are older than 30 days
- **THEN** doctor reports their count and age without marking, moving, truncating, or deleting them

#### Scenario: Excess terminal Plugin jobs exist
- **WHEN** an owner bucket contains more than 100 terminal job receipts
- **THEN** doctor reports the oldest excess receipts as dry-run cleanup candidates without deleting them

### Requirement: Doctor describes authentication evidence without overstating liveness
The zero-model-cost operator doctor SHALL report whether the fixed Claude credential is present, locally expired, or unavailable and SHALL explicitly report `liveValidated: false` for metadata-only authentication checks. Credential presence MAY remain a passing readiness fact when the host CLI can perform its own refresh, while local expiry SHALL be visible as bounded advisory evidence. Doctor SHALL NOT launch Claude print mode, refresh credentials, mutate the credential store, or claim that a provider request succeeded.

#### Scenario: Auth status reports logged in
- **WHEN** `claude auth status --json` reports a logged-in Claude account and the fixed credential record is readable
- **THEN** doctor reports bounded method/provider/subscription facts, local credential state, and `liveValidated: false` instead of “authentication is active”

#### Scenario: Local access token has expired
- **WHEN** the fixed native credential record has an access expiry at or before the doctor observation time
- **THEN** doctor reports the credential as locally expired or refreshable advisory evidence without exposing secrets or performing a model call

#### Scenario: Diagnostic output is persisted or shared
- **WHEN** doctor output is rendered as text or JSON
- **THEN** it contains no token, token hash, raw credential path content, account identity, organization identity, or arbitrary native auth output
