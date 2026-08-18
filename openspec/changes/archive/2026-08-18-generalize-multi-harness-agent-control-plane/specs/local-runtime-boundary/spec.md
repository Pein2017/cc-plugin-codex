## ADDED Requirements

### Requirement: Operator-owned Harness services remain outside Plugin lifecycle ownership
A checkout-owned Driver MAY attach to a preconfigured local service or use a host-installed Harness executable or SDK. The Plugin SHALL inspect readiness without installing, logging in, starting, stopping, restarting, reconfiguring, or exposing credentials for that Harness. Model-facing inputs SHALL NOT accept executable paths, endpoints, usernames, passwords, tokens, configuration paths, environment files, or lifecycle bypasses.

#### Scenario: Persistent service is unavailable
- **WHEN** side-effect-free readiness cannot reach the configured logical instance
- **THEN** that instance is reported unavailable and no Plugin action starts or repairs the service

#### Scenario: Operator has already authenticated a Harness
- **WHEN** the Driver can validate local readiness from its fixed checkout-owned configuration boundary
- **THEN** the Plugin may use the instance without copying credentials into prompts, receipts, logs, or durable locators

### Requirement: Each Driver owns a bounded environment view
The shared runtime SHALL resolve the one canonical environment file as data, then provide each static Driver only the checkout-owned keys admitted for that Driver. A Driver SHALL declare redacted external dependencies and SHALL NOT receive arbitrary environment values through model-facing route input or persist them as readiness evidence.

#### Scenario: Two Drivers require different host settings
- **WHEN** their static environment schemas differ
- **THEN** each receives its admitted fixed values without changing the canonical environment-file owner or leaking the other Driver's private settings

