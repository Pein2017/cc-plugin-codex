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
