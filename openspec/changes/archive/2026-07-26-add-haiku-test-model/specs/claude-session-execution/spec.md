## ADDED Requirements

### Requirement: Account-limit exhaustion is terminal and non-fallback
The runtime SHALL classify explicit Claude subscription, usage, credit, weekly/monthly, or quota-limit exhaustion as `usage_or_subscription_limit`. It SHALL expose the terminal failure without automatic reconnect or model fallback. Terminal result error strings SHALL participate in classification so a structured Claude error cannot be hidden by an empty final message.

#### Scenario: Structured result reports a periodic usage limit
- **WHEN** Claude exits with a terminal result whose errors state that a weekly, monthly, subscription, usage, credit, or quota limit is exhausted
- **THEN** the attempt fails as `usage_or_subscription_limit` and the supervisor performs no reconnect

#### Scenario: Limit text also contains HTTP 429
- **WHEN** explicit account-exhaustion text is accompanied by HTTP 429
- **THEN** permanent account-limit classification takes precedence over transport retry

#### Scenario: Generic transport rate limit is transient
- **WHEN** an attempt reports HTTP 429 without explicit subscription, usage, credit, periodic, or quota exhaustion
- **THEN** the existing bounded transport-recovery policy remains applicable

#### Scenario: Rate limit mentions a usage tier
- **WHEN** HTTP 429 reports a request or rate limit for the current usage tier and provides retry guidance without saying account capacity is exhausted
- **THEN** the failure remains eligible for bounded exact-session transport recovery

#### Scenario: User-directed wording names a rate or request limit
- **WHEN** HTTP 429 says the caller has hit, reached, or exceeded a rate limit or request limit and provides retry guidance
- **THEN** the failure remains eligible for bounded exact-session transport recovery rather than being treated as account-capacity exhaustion

#### Scenario: Billing-period allowance is exhausted
- **WHEN** Claude explicitly reports that the current period allowance or billing-period limit is exhausted or reached
- **THEN** the attempt fails as `usage_or_subscription_limit` and the supervisor performs no reconnect

#### Scenario: Caller-imposed command budget is exhausted
- **WHEN** Claude reports `error_max_budget_usd` or otherwise identifies that the caller's `--max-budget-usd` ceiling was reached, even if its prose contains "usage limit"
- **THEN** the attempt terminates without being classified as subscription or usage exhaustion

## MODIFIED Requirements

### Requirement: Initial Agent sessions have an explicit Claude display name
The runtime SHALL pass the durable Agent name through Claude's `--name` option when creating a new session, so Claude Code does not need an auxiliary model to generate an automatic title. Exact-session resumes SHALL retain the existing session identity without renaming it.

#### Scenario: Initial Agent turn starts
- **WHEN** a new Agent turn creates a fresh Claude session
- **THEN** Claude receives the Agent name through `--name` together with the selected canonical `claude-haiku-4-5`, `claude-sonnet-5`, or `claude-opus-5` model

#### Scenario: Exact session resumes
- **WHEN** a follow-up resumes an existing Claude session
- **THEN** the runtime uses the exact session ID without adding a new `--name` argument
