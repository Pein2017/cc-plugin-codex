## MODIFIED Requirements

### Requirement: wait_agent returns bounded root mailbox activity
`wait_agent` SHALL accept optional `timeout_ms` plus the CC durable-delivery extension `acknowledge_tokens`, SHALL default its observation upper bound to 600000 ms, SHALL reject values above 3600000 ms, SHALL first acknowledge only a valid oldest Agent-linked contiguous completion prefix from a prior response, and then return a Codex-V2-shaped message/timed-out receipt with at most one current-root activity update. It SHALL prioritize the oldest unread completion over advisory progress. A completion update SHALL include the complete stored Agent final message, its legacy-compatible truncation flag, and opaque delivery token; a progress update SHALL include only the safe bounded public-progress projection when its adaptive delivery interval is eligible. It SHALL omit raw inbox state, full Agent records, result pointers, native session evidence, and reconciliation detail, and SHALL NOT acknowledge a newly returned completion in the same call.

#### Scenario: Unread activity predates wait
- **WHEN** the root inbox already contains an unread Agent completion
- **THEN** wait returns one status/summary/complete-final-message update with an opaque delivery token and leaves it unread

#### Scenario: Later wait confirms prior delivery
- **WHEN** a later wait echoes valid tokens for the oldest unread contiguous completion prefix
- **THEN** the cursor advances across that update and any preceding quarantined legacy sequences before returning or waiting

#### Scenario: Root Agent publishes progress
- **WHEN** any current-root Agent publishes safe progress before timeout and no completion is unread
- **THEN** wait reports one bounded progress update without returning Claude text or tool inputs

#### Scenario: Root Agent completes
- **WHEN** any current-root Agent publishes completion activity before timeout
- **THEN** wait reports completion activity with the complete stored Agent final message

#### Scenario: Root mailbox remains quiet
- **WHEN** `timeout_ms` expires without new current-root Agent progress or completion activity
- **THEN** wait returns an honest timeout without interrupting or changing any Agent

#### Scenario: Caller omits timeout
- **WHEN** the parent calls wait without `timeout_ms`
- **THEN** the observation deadline is 600000 ms while eligible progress or completion may return earlier

#### Scenario: Caller exceeds the maximum
- **WHEN** the parent requests `timeout_ms` greater than 3600000
- **THEN** wait rejects the invalid bound before changing Agent or delivery state

### Requirement: All canonical Agent skills disclose Experimental status
Each of the seven model-visible CC Agent skills and its discovery metadata SHALL identify the feature as Experimental and SHALL state that the local plugin cannot automatically start a new Codex model turn after the parent has ended.

#### Scenario: A newly started Codex task discovers the plugin
- **WHEN** the seven Agent skills are loaded from the installed local snapshot
- **THEN** every skill is visibly described as Experimental without claiming automatic idle-parent wakeup

### Requirement: Completed results use the completion handoff
When `wait_agent` returns a completion update, the parent SHALL synthesize its complete final message directly and SHALL NOT start a follow-up turn, read history, or ask the Agent to write a temporary file solely to recover that current completed result. `read_agent_messages` SHALL be reserved for retrospective access to earlier native messages or explicit recovery investigation.

#### Scenario: Required Agent completes
- **WHEN** wait returns a complete final message for required work
- **THEN** the parent uses that message for disposition and synthesis without a result-recovery follow-up or history read

#### Scenario: Parent needs an older Agent message
- **WHEN** the current completion is already disposed or the requested evidence belongs to an earlier Agent turn
- **THEN** the parent may use `read_agent_messages` on the same exact Agent without activating Claude

## ADDED Requirements

### Requirement: read_agent_messages provides root-scoped retrospective access
`read_agent_messages` SHALL require an exact current-root Agent target, SHALL accept only optional `before` and `limit` pagination fields, SHALL default to the latest one eligible outer-assistant native message, and SHALL reject limits outside 1 through 20. It SHALL return messages newest first with complete text and opaque message IDs, plus a next cursor only when older eligible messages remain. It SHALL be observation-only and SHALL NOT activate, resume, interrupt, steer, or change acknowledgement or lifecycle state.

#### Scenario: Parent requests latest history
- **WHEN** the parent calls `read_agent_messages` with only an exact Agent target
- **THEN** it receives at most the latest one eligible outer-assistant message without changing the Agent

#### Scenario: Parent requests an older page
- **WHEN** the parent echoes a valid returned message ID as `before`
- **THEN** it receives only older eligible messages up to the requested message-count limit

#### Scenario: Parent supplies an invalid cursor or limit
- **WHEN** `before` is not an eligible message ID for that Agent or `limit` is outside 1 through 20
- **THEN** the operation fails before returning unrelated transcript content

#### Scenario: Parent attempts a foreign read
- **WHEN** the target does not resolve exactly inside the current root
- **THEN** the operation fails under the same root-isolation boundary as other Agent mutations
