## ADDED Requirements

### Requirement: All canonical Agent skills disclose Experimental status
Each of the six model-visible CC Agent skills and its discovery metadata SHALL identify the feature as Experimental and SHALL state that the local plugin cannot automatically start a new Codex model turn after the parent has ended.

#### Scenario: A newly started Codex task discovers the plugin
- **WHEN** the six Agent skills are loaded from the installed local snapshot
- **THEN** every skill is visibly described as Experimental without claiming automatic idle-parent wakeup

### Requirement: Parent orchestration uses explicit join policy
The spawn and wait skill contracts SHALL require the parent to classify delegated work as required, parallel-then-join, or explicitly detached. The parent SHALL NOT give its final answer while a required or parallel-then-join result remains undisposed, SHALL continue meaningful non-overlapping work before waiting when possible, and SHALL use detached mode only when the user clearly requests background execution and the result is not needed in the current answer.

#### Scenario: Child result is required evidence
- **WHEN** the parent's conclusion depends on a spawned Agent's result
- **THEN** the parent waits for and synthesizes that completion before giving its final answer

#### Scenario: Independent parent work remains
- **WHEN** a spawned Agent can run concurrently with meaningful non-overlapping parent work
- **THEN** the parent performs that work before joining rather than immediately polling by reflex

#### Scenario: User explicitly requests background execution
- **WHEN** the user asks to detach work whose result is not needed for the current answer
- **THEN** the parent may end after reporting the durable Agent identity and the lack of automatic host reactivation

### Requirement: Completed results use the completion handoff
When `wait_agent` returns a completion handoff, the parent SHALL synthesize it directly and SHALL NOT start a follow-up turn or ask the Agent to write a temporary file solely to recover the already-completed result.

#### Scenario: Required Agent completes
- **WHEN** wait returns a bounded completion handoff for required work
- **THEN** the parent uses that handoff for disposition and synthesis without a result-recovery follow-up

## MODIFIED Requirements

### Requirement: Plugin skills map directly to the canonical operations
The installed plugin SHALL expose exactly `$cc-for-pein:spawn-agent`, `$cc-for-pein:send-message`, `$cc-for-pein:followup-task`, `$cc-for-pein:wait-agent`, `$cc-for-pein:interrupt-agent`, and `$cc-for-pein:list-agents`, each delegating to the matching checkout-owned snake_case runtime operation. All six SHALL be identified as Experimental and eligible for model-visible skill discovery in a newly started Codex task.

#### Scenario: Installed snapshot is verified in a new task
- **WHEN** Codex loads plugin version `0.4.0`
- **THEN** all six Experimental lifecycle skills are present in the model-visible catalog and none of the old lifecycle skills is discoverable

### Requirement: wait_agent returns bounded root mailbox activity
`wait_agent` SHALL accept optional `timeout_ms` plus the CC durable-delivery extension `acknowledge_tokens`, SHALL first acknowledge only a valid oldest Agent-linked contiguous completion prefix from a prior response, and then return a Codex-V2-shaped message/timed-out receipt with at most one current-root activity update. It SHALL prioritize the oldest unread completion over advisory progress. A completion update SHALL include a bounded completion handoff and opaque delivery token; a progress update SHALL include only the safe public-progress projection. It SHALL omit raw inbox state, full Agent records, full final output, and reconciliation detail, and SHALL NOT acknowledge a newly returned completion in the same call.

#### Scenario: Unread completion predates wait
- **WHEN** the root inbox already contains an unread Agent completion
- **THEN** wait returns one bounded status/summary/completion-handoff update with an opaque delivery token and leaves it unread

#### Scenario: Later wait confirms prior completion delivery
- **WHEN** a later wait echoes valid tokens for the oldest unread contiguous completion prefix
- **THEN** the cursor advances across that update and any preceding quarantined legacy sequences before returning or waiting

#### Scenario: Root Agent publishes progress
- **WHEN** any current-root Agent publishes safe progress before timeout and no completion is unread
- **THEN** wait reports one bounded progress update without returning Claude text or tool inputs

#### Scenario: Root Agent completes
- **WHEN** any current-root Agent publishes completion activity before timeout
- **THEN** wait reports completion activity with the bounded handoff rather than the full Agent final message

#### Scenario: Root mailbox remains quiet
- **WHEN** `timeout_ms` expires without new current-root Agent progress or completion activity
- **THEN** wait returns an honest timeout without interrupting or changing any Agent
