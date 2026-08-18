## MODIFIED Requirements

### Requirement: Default release smoke costs no Claude model usage
The checkout SHALL provide a release smoke that verifies the enabled current HarnessDock for Codex record, matching installed snapshot, exactly eight `$codex-harnessdock:*` Skills, an absolute canonical-checkout descriptor bootstrap, exactly eight `codex_harnessdock` MCP tools, and successful isolated `list_agents` and `list_harnesses` calls through the production isolated runtime path. Harness listing MAY report external instances unavailable and SHALL not contact a model. The smoke SHALL verify retained compatibility shells and known predecessor coverage as before and SHALL reject concurrent legacy `cc_for_pein` discovery. The default smoke SHALL NOT start a Codex, Claude, OpenCode, or provider model turn.

#### Scenario: Matching installation is ready
- **WHEN** the operator runs default release smoke after local refresh or versioned release
- **THEN** it exercises the installed snapshot and MCP protocol successfully without model usage

#### Scenario: OpenCode is not running
- **WHEN** zero-cost smoke lists Harnesses
- **THEN** it accepts a bounded unavailable OpenCode instance while still verifying the eight-tool contract and no model execution

#### Scenario: Installed current snapshot is stale
- **WHEN** installed current version or discovery content differs from the checkout
- **THEN** smoke fails before MCP execution and instructs the operator to run the appropriate local refresh

#### Scenario: Known predecessor is missing
- **WHEN** successful-install metadata names an unreconstructable previous version
- **THEN** smoke fails with actionable compatibility repair instead of accepting an empty shell set

## ADDED Requirements

### Requirement: OpenCode Explorer live acceptance is explicit and bounded
Before releasing the experimental OpenCode capability, the checkout SHALL require a separate explicit live flag and SHALL announce the exact Harness/model/Agent/workspace before any model request. It SHALL run no more than the three specified read-only successes, using exact-session follow-up only when authoritative session/incarnation evidence is present and otherwise using the specified fresh-only substitute. It SHALL stop on account/auth/quota evidence and capture only the bounded evidence required by `opencode-explorer-runtime`. It SHALL neither install/launch the Server nor fall back automatically to Claude, another OpenCode model, direct provider API, or CLI attach.

#### Scenario: Live flag is omitted
- **WHEN** release smoke or the acceptance script runs without explicit authorization
- **THEN** no OpenCode session or model request is created

#### Scenario: Live acceptance is requested
- **WHEN** the operator supplies the exact flag with a prepared Server and disposable or approved repository
- **THEN** at most three route-fixed read-only examples run and the evidence report records pass, fail, or blocked without automatic retry beyond the specified matrix

### Requirement: OpenCode acceptance loop is regression tested without Server or model usage
The repository SHALL test the complete OpenCode acceptance controller against a fake SDK/Server transport, including route discovery, profile rejection, native acceptance, malformed output, metrics, mutation failure, exact follow-up, mixed-route projection, auth/quota stop, and report finalization, without a live Server or model request.

#### Scenario: Zero-cost acceptance regression runs
- **WHEN** `npm run check` executes the fake OpenCode acceptance suite
- **THEN** every control branch is verified with no network service or paid usage
