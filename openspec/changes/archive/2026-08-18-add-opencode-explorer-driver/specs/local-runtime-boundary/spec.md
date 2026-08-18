## ADDED Requirements

### Requirement: OpenCode uses one exactly pinned network client
Before adding a production client, the checkout SHALL capture the configured Server/OpenAPI/SDK compatibility facts and then depend on one exact compatible `@opencode-ai/sdk` version or, only when no stable compatible SDK exists, one separately reviewed generated typed OpenAPI client. The runtime SHALL use only that pinned client connection to an existing Server. It SHALL NOT use a range, `latest`, a Server-spawning helper, embedded/in-process Server, raw provider client, ad hoc HTTP, or CLI stdout as the production integration. Upgrading or changing the client SHALL require captured type/fixture comparison and a separate compatibility decision.

#### Scenario: Dependency lock drifts
- **WHEN** package or lock metadata resolves another client version or shape than the accepted compatibility fixture
- **THEN** verification fails before OpenCode release acceptance

### Requirement: OpenCode connection configuration is fixed and secret-safe
The canonical runtime environment SHALL provide one checkout-owned loopback Server URL. Optional official Basic-auth username/password variables SHALL be inherited only from the operator environment, admitted through an exact secret allowlist, and omitted from the tracked environment file and all receipts. The Driver SHALL construct a bounded authenticated fetch with explicit request deadlines and caller cancellation while preventing proxy routing for loopback.

#### Scenario: Model-facing endpoint is supplied
- **WHEN** spawn, follow-up, or any other tool includes an endpoint, username, password, token, directory override, timeout bypass, or SDK option
- **THEN** strict validation rejects it before connection or state mutation

#### Scenario: Request exceeds its deadline
- **WHEN** health, discovery, session, message, or prompt-admission observation exceeds the Driver-owned bound
- **THEN** the request aborts with a sanitized retryability classification and never becomes a silent infinite wait

### Requirement: OpenCode CLI remains diagnostic only
The operator MAY use `opencode serve`, `opencode models`, or `opencode run --attach` outside the Plugin for setup and diagnosis. Production Agent lifecycle SHALL not shell out to those commands, parse terminal or JSON-event stdout, manage their PID, or treat CLI availability as a substitute for Server/SDK readiness.

#### Scenario: CLI is absent but Server is reachable
- **WHEN** the pinned SDK can validate the configured Server and route
- **THEN** Driver readiness may succeed without a local `opencode` executable in the Plugin process environment
