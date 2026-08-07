## ADDED Requirements

### Requirement: Driver terminal metrics are closed and evidence-only
Each completed Harness turn SHALL return either `metrics: null` or one version-one normalized metrics object with separate `provider_reported` and `plugin_observed` sections. Provider-reported metrics SHALL contain only admitted non-negative finite numeric duration, API duration, turn-count, token-count, and reported-cost fields copied from native terminal evidence. Plugin-observed metrics SHALL contain only bounded non-negative integer tool-call, attempt, and recovery-attempt counts derived from retained runtime receipts. Unknown, malformed, negative, non-finite, nested payload-bearing, or unsupported fields SHALL be omitted; an object with no admitted evidence SHALL normalize to `null`.

#### Scenario: Harness reports complete usage
- **WHEN** a Driver observes admitted numeric terminal duration, token, turn, and cost fields
- **THEN** it returns their exact normalized values without pricing, unit conversion, or subscription-charge claims

#### Scenario: Harness reports partial usage
- **WHEN** only some admitted fields are present
- **THEN** the Driver returns those exact fields and nullable missing fields without inventing defaults

#### Scenario: Native metrics are malformed
- **WHEN** terminal evidence contains strings, negative values, non-finite numbers, unknown keys, or nested arbitrary payloads
- **THEN** those values do not enter the normalized Driver result or public receipt

#### Scenario: Another Harness uses different usage fields
- **WHEN** a future Driver cannot map native usage to the admitted version-one vocabulary
- **THEN** it returns `provider_reported: null` rather than pretending Claude Code field parity

