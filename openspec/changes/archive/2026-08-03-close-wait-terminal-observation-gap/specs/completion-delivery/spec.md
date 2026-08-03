## ADDED Requirements

### Requirement: Wait performs one final completion observation
After its bounded observation returns, `wait_agent` SHALL reconcile current-root
terminal facts and, unless that observation already returned a completion,
perform one zero-time unread-completion observation before constructing the
public receipt. A completion visible at that final observation SHALL replace a
timeout or advisory progress result and SHALL use the existing frozen payload,
delivery token, acknowledgement, and at-least-once redelivery semantics. A
timeout SHALL therefore mean that no unread current-root completion was visible
at that final observation. A genuinely quiet final observation SHALL acquire no
completion-inbox write lock, call no fsync, and write no durable state.

#### Scenario: Exit reconciliation repairs missing publication
- **WHEN** the bounded wait finds no completion and exit-time reconciliation publishes a missing terminal completion event
- **THEN** the same `wait_agent` call returns that completion rather than timeout

#### Scenario: Completion appears after the last bounded poll
- **WHEN** a current-root completion becomes unread after the bounded loop's last poll but before the final observation
- **THEN** the same call returns the completion with its existing delivery token

#### Scenario: Final observation remains quiet
- **WHEN** reconciliation is settled and no unread current-root completion exists at the final observation
- **THEN** the call preserves its timeout result without a completion-inbox lock, fsync, or durable write

#### Scenario: Completion appears after return
- **WHEN** a completion becomes unread only after the final observation and public receipt has been constructed
- **THEN** that completion remains durably unread for the next wait and does not retroactively change the prior timeout
