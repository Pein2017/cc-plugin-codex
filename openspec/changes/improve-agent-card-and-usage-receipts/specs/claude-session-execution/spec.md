## ADDED Requirements

### Requirement: Claude terminal usage is sanitized before leaving the Driver
The Claude Code Driver SHALL inspect only the terminal `result` event for provider-reported metrics. It SHALL admit exact non-negative finite values for `duration_ms`, `duration_api_ms`, `num_turns`, `total_cost_usd`, and the top-level usage counters `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, and `cache_read_input_tokens`. Counts and durations SHALL be safe integers; reported cost SHALL be a finite number. The Driver SHALL label `total_cost_usd` as Claude-reported cost rather than actual subscription billing and SHALL NOT expose service-tier text, nested cache details, server-tool usage, terminal text, arbitrary usage keys, or the raw event through public metrics.

#### Scenario: Claude returns a successful terminal event
- **WHEN** the event contains admitted usage and timing fields
- **THEN** the Driver copies only those exact numeric values into normalized provider-reported metrics

#### Scenario: Claude returns an error terminal event with usage
- **WHEN** a terminal error still contains admitted numeric metrics
- **THEN** the Driver may preserve those metrics independently of failure classification and final-message absence

#### Scenario: Claude changes its result shape
- **WHEN** a future Claude Code version moves, renames, nests, or changes the type of a usage field
- **THEN** the field is omitted and protocol-drift diagnostics remain bounded without projecting arbitrary event content

#### Scenario: Max subscription uses reported cost
- **WHEN** Claude supplies `total_cost_usd` under a subscription-backed session
- **THEN** the public field is named and documented as `reported_cost_usd` and is never described as the user's charged amount

