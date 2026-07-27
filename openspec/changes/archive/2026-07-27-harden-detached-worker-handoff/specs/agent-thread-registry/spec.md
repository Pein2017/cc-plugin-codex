## MODIFIED Requirements

### Requirement: First-turn failure does not create an unusable silent mailbox
The runtime SHALL validate the complete execution profile before reserving an
Agent and SHALL roll back an Agent reservation when synchronous preparation
fails before detached-worker launch. The first-turn prompt SHALL already exist
as the Agent's first mailbox entry; rollback SHALL remove the Agent and name only
when that original message is still its sole entry and no job or session was
established, otherwise it SHALL preserve every concurrently queued message in
order. A prepared Agent and its mailbox MAY be rolled back only for a structured
`rollback_safe` disposition proving that OS worker spawn never succeeded. Once
detached worker launch is durably marked, `lifecycle_owned` or
`ownership_uncertain` SHALL preserve the Agent attachment, lifecycle, mailbox
assignment, and exact-session lease until worker lifecycle or terminal
pre-Claude reconciliation resolves them. A terminal receipt retaining
`preClaudeLaunch=true` SHALL restore the prior Agent lifecycle and requeue its
linked messages. After durable Claude child acceptance, the runtime SHALL permit
a fresh-session retry on the same Agent only when later durable evidence proves
no Claude session and no possible side effect; otherwise it SHALL retain
lifecycle `errored`, set `continuation=blocked` with evidence, and reject
non-activating messages that could never be delivered.

#### Scenario: Validation fails before reservation
- **WHEN** the requested execution profile is invalid
- **THEN** no Agent, name reservation, mailbox entry, or job is created

#### Scenario: Readiness fails before launch
- **WHEN** Agent creation succeeded but synchronous readiness or job preparation
  fails
- **THEN** the Agent and name are removed only if no concurrent mailbox entry,
  job, or session exists; otherwise the ordered mailbox and identity remain
  durable

#### Scenario: Parent fails before worker spawn
- **WHEN** activation reports `rollback_safe` because OS worker spawn never
  succeeded
- **THEN** Agent and mailbox rollback may proceed under the existing empty-
  reservation and concurrency safeguards

#### Scenario: Parent errors after spawning
- **WHEN** activation reports `lifecycle_owned` or `ownership_uncertain` after
  detached worker launch began
- **THEN** the Agent lifecycle, active job, assigned mailbox, and exact-session
  lease remain durable until worker lifecycle or pre-Claude reconciliation
  resolves them

#### Scenario: Attached activation fails before Claude launch
- **WHEN** a terminal receipt linked to the Agent still has `preClaudeLaunch=true`
- **THEN** reconciliation releases that activation, restores prior Agent state,
  requeues its assigned or dispatched messages, and publishes no completion

#### Scenario: First turn fails safely before session capture
- **WHEN** post-launch evidence proves no session, tool use, file touch, or other
  possible side effect
- **THEN** `followup_task` may retry the same Agent on a fresh session

#### Scenario: First turn fails ambiguously
- **WHEN** no resumable session exists and possible side effects cannot be
  excluded
- **THEN** the Agent is errored with blocked continuation evidence, and
  `send_message` rejects instead of queueing forever
