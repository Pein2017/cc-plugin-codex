## ADDED Requirements

### Requirement: Credential refresh can safely unblock the same logical Agent
An Agent blocked by a terminal `auth_or_permission` failure SHALL preserve its historical `auth_required / harness / operator_required` completion unchanged. A later `followup_task` MAY satisfy that operator requirement and start a `safe_fresh` native Claude session on the same logical Agent only when the blocked job is the Agent's first activation, the current Driver observes the same fixed Harness/config identity, a different redacted credential generation whose access credential is locally current, and durable evidence that the failed turn produced no tool use, file touch, useful outer-assistant output, or other possible side effect. The recovery check SHALL occur before new follow-up mailbox mutation or job preparation and SHALL be bounded to the selected Agent's latest failed activation.

#### Scenario: Operator refreshed credentials after a side-effect-free 401
- **WHEN** follow-up targets an authentication-blocked Agent, the credential generation changed under the same fixed config identity, the replacement access credential is locally current, and the failed turn proves no possible side effect
- **THEN** the runtime preserves the Agent ID, name, route, delegation mode, and history, atomically requeues only the original task messages consumed by that failed activation, and activates those messages plus the new follow-up in one new safe-fresh Claude native session

#### Scenario: Credential generation is unchanged
- **WHEN** follow-up targets an authentication-blocked Agent and the current credential generation equals the generation captured by the failure
- **THEN** follow-up remains rejected with bounded `auth_required / harness / operator_required` evidence and performs no mailbox or job mutation

#### Scenario: Replacement credential is locally expired or unproven
- **WHEN** the credential generation changed but its local access expiry is missing, malformed, or not later than the recovery observation time
- **THEN** the Agent remains blocked and no native process is launched

#### Scenario: Failed turn may have produced a side effect
- **WHEN** the authentication-failed turn is not the Agent's first activation, has tool use, file-touch evidence, useful assistant output, a message acknowledged by a different turn, a foreign session/config identity, or incomplete recovery evidence
- **THEN** the runtime does not convert the Agent to safe-fresh continuation and requires a new Agent or explicit future recovery contract

#### Scenario: Original prompt was consumed only by the failed authentication activation
- **WHEN** the first activation terminally acknowledged its initial Agent messages but all of those acknowledgements belong exclusively to the side-effect-free authentication-failed job
- **THEN** recovery restores those same message identities to queued state before accepting the new follow-up, so the safe-fresh turn receives the original task exactly once

#### Scenario: Historical completion is read after recovery
- **WHEN** the same logical Agent later activates successfully after credential refresh
- **THEN** the original completion remains an immutable authentication failure with its original acknowledgement and blocking evidence

#### Scenario: Non-activating message targets the blocked Agent
- **WHEN** `send_message` targets an authentication-blocked Agent before a successful recovery activation
- **THEN** it continues to reject rather than treating credential rotation as an implicit activation request
