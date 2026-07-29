## MODIFIED Requirements

### Requirement: send_message never activates an idle Agent
`send_message` SHALL append the complete message and delivery evidence to the Agent-level durable mailbox, deliver to an active Agent turn when possible, and leave the message queued without starting a new turn when the Agent is terminal. A successful model-facing receipt SHALL contain only stable `agent_name` and `delivery`; it SHALL preserve the `dispatched_active`, `activation_pending`, and `queued_no_turn` dispositions while excluding Agent status, the message text, message and Agent IDs, timestamps, assignment, job, steering, model, and delegation metadata. Model-facing guidance SHALL summarize success in one concise disposition-aware sentence and SHALL NOT print raw JSON unless the user explicitly requests debug detail.

#### Scenario: Agent is running
- **WHEN** a message is sent during an active Claude stream
- **THEN** it is delivered in durable order at the next supported stream boundary and the public receipt reports `dispatched_active` without internal delivery evidence

#### Scenario: Agent is terminal
- **WHEN** a message is sent while no turn is active
- **THEN** it is retained as a `queued` Agent-mailbox entry, the public receipt reports `queued_no_turn`, and no Claude process starts

#### Scenario: Agent activation is pending
- **WHEN** the message is durably assigned to an Agent activation that has not yet reached a supported stream boundary
- **THEN** the public receipt reports `activation_pending` without exposing its assigned job or mailbox record

#### Scenario: Agent is activation-blocked
- **WHEN** an errored Agent has `continuation=blocked`
- **THEN** send rejects the message with the blocking evidence instead of queueing it indefinitely

#### Scenario: Parent presents successful delivery
- **WHEN** the model receives a successful `send_message` receipt
- **THEN** it presents one concise sentence reflecting the delivery disposition and does not repeat the message or raw receipt unless the user requested debug detail
