## ADDED Requirements

### Requirement: Runtime support scope is Linux
The checkout-owned runtime SHALL support Node.js 20.19 or newer on Linux. macOS
and native Windows behavior is best-effort and SHALL NOT be treated as a release
or compatibility guarantee without a separate OpenSpec change and real-platform
acceptance evidence.

#### Scenario: Supported Linux runtime starts
- **WHEN** the checkout runs on Linux with a compatible Node.js and host Claude CLI
- **THEN** the full runtime, installation, process-control, and state-protection contracts apply

#### Scenario: Non-Linux runtime is attempted
- **WHEN** the checkout is invoked on macOS or native Windows
- **THEN** any surviving defensive behavior is explicitly unsupported and its limitations do not block the Linux release

## REMOVED Requirements

### Requirement: Runtime remains platform portable
**Reason**: The product owner requires Linux support only; a three-platform guarantee creates unneeded acceptance and maintenance obligations.

**Migration**: Use Linux with Node.js 20.19+ for supported execution. Introduce a future OpenSpec change before claiming another supported platform.

#### Scenario: Platform cannot provide graceful SIGINT
- **WHEN** a non-Linux platform lacks the Linux process-control contract
- **THEN** the runtime makes no supported portability claim
