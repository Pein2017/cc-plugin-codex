## MODIFIED Requirements

### Requirement: One operator doctor reports actionable health
The checkout SHALL provide one Linux operator command that evaluates checkout identity, installed Plugin parity, required Node dependencies, Claude CLI availability and static compatibility, Claude authentication, the fixed config/proxy envelope, exactly seven MCP tools, and storage health. Each check SHALL return a stable identifier, bounded status, redacted summary, and actionable recovery when failed. The command SHALL NOT be exposed through Plugin Skills or MCP tools.

#### Scenario: All required surfaces are healthy
- **WHEN** the operator runs doctor from the canonical checkout with the matching Plugin installed
- **THEN** it exits successfully and reports every required check as passed or advisory

#### Scenario: Required dependency is absent
- **WHEN** the MCP SDK or Zod cannot be resolved from the canonical checkout
- **THEN** doctor fails with an instruction to run `npm install` in `/data/CoordExp/codex-harnessdock`
