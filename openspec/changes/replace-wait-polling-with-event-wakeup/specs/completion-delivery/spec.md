## ADDED Requirements

### Requirement: Durable wait uses event hints with bounded recovery
On supported Linux filesystems, an internal wait that has found no eligible completion or explicitly requested progress SHALL register ephemeral filesystem watchers for the relevant existing durable-state directories or their nearest existing ancestor inside the Plugin state root, SHALL perform a second durable observation after registration, and SHALL then block until a watcher hint, bounded recovery scan, deadline, or abort. Watcher notifications SHALL be hints only; completion inboxes, job files, and their validated projections SHALL remain the sole lifecycle facts. The wait SHALL NOT create persistence paths or durable notification state merely to observe activity.

#### Scenario: Completion arrives after watcher registration
- **WHEN** an Agent completion is durably published while a compatible watcher is active
- **THEN** the wait wakes promptly, rereads the inbox, and returns the completion under the existing freeze and acknowledgement contract

#### Scenario: Completion races watcher registration
- **WHEN** completion is published between the initial durable read and watcher establishment
- **THEN** the mandatory second read observes it without waiting for another event or recovery interval

#### Scenario: Atomic replacement publishes a job or inbox
- **WHEN** a writer renames an atomically prepared file into a watched directory
- **THEN** the directory hint causes a durable reread and no file-inode watcher is treated as authoritative

#### Scenario: Watched directory does not yet exist
- **WHEN** the jobs or owner inbox directory is absent at wait entry
- **THEN** the runtime watches only the nearest existing ancestor inside the Plugin state root, creates no directory, and rebuilds narrower coverage after activity

#### Scenario: Watcher event is dropped
- **WHEN** durable activity occurs but no watcher callback is delivered
- **THEN** the 10-second recovery observation discovers the fact before the caller deadline where time remains

#### Scenario: Watcher cannot be established
- **WHEN** every relevant watcher setup fails or becomes unusable
- **THEN** wait uses the 5-second bounded fallback scan without changing lifecycle state or claiming event-driven latency

#### Scenario: Wait is aborted
- **WHEN** the caller AbortSignal fires while watchers or timers are active
- **THEN** all watcher/timer resources close and the existing `AbortError` is returned without acknowledging or mutating future completion facts

#### Scenario: Quiet wait reaches deadline
- **WHEN** no eligible activity occurs before the deadline
- **THEN** wait returns the existing timeout receipt, closes all ephemeral resources, and performs no durable write

#### Scenario: Completion and progress become visible together
- **WHEN** a watcher or recovery observation finds both an unread completion and eligible opt-in progress
- **THEN** completion is selected first under the existing delivery contract

#### Scenario: Isolated MCP worker completes
- **WHEN** a wait operation returns or fails inside its isolated Worker
- **THEN** no persistent watcher keeps that Worker resident after the operation lifecycle ends

### Requirement: Event-wakeup efficiency is mechanically verified
The checkout SHALL include deterministic tests that count durable fact reads and watcher/recovery reasons plus a supported-Linux filesystem integration test for atomic-rename wakeup. These diagnostics SHALL remain test- or operator-facing and SHALL NOT change model-facing wait input or output.

#### Scenario: Quiet bounded wait is tested
- **WHEN** a deterministic wait remains quiet for less than the recovery interval
- **THEN** its durable read count is bounded by initial and post-registration observations rather than the former 500 ms cadence

#### Scenario: Real Linux rename is tested
- **WHEN** a test atomically publishes a completion or job update in a watched directory
- **THEN** the blocked wait reports a filesystem-event wake before an injected long recovery interval and then returns the durable fact as evidence

#### Scenario: Model-facing caller uses wait_agent
- **WHEN** the internal event-wakeup implementation is active
- **THEN** the public schema, one-hour upper bound, receipt, delivery token, and progress opt-in contract remain unchanged
