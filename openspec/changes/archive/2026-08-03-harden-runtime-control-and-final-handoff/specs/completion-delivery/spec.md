## ADDED Requirements

### Requirement: Completion acknowledgement is conditional and exact
A caller that performs another `wait_agent` call after receiving a completion SHALL pass that completion token exactly once so the inbox can acknowledge it; a caller that ends its task after consuming the handoff is not required to issue a separate acknowledgement call.

#### Scenario: Caller continues waiting
- **WHEN** a caller receives a completion and invokes `wait_agent` again for the same root
- **THEN** it passes the prior completion token in that next call

#### Scenario: Caller finishes after consuming completion
- **WHEN** a caller receives and consumes the completion handoff and performs no later wait
- **THEN** no extra acknowledgement-only operation is required
