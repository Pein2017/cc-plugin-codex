## MODIFIED Requirements

### Requirement: wait_agent delivers progress as advisory root activity
`wait_agent` SHALL return at most one atomically claimed oldest pending current-root Agent progress update only when the caller explicitly sets `wake_on_progress: true` and no unread completion has priority. The update SHALL identify the Agent, progress revision, activity kind, phase, bounded summary, and timestamp, and SHALL advance a persisted monotonic advisory delivery revision without changing Agent lifecycle state. A wait that omits or disables `wake_on_progress` SHALL neither return nor claim progress.

#### Scenario: Progress arrives during an explicit progress wait
- **WHEN** a current-root Agent publishes a new public-progress revision before timeout, the caller set `wake_on_progress: true`, and no completion is unread
- **THEN** wait returns promptly with that Agent's bounded progress update

#### Scenario: Ordinary completion wait observes pending progress
- **WHEN** a current-root Agent has pending public progress and the caller omits or disables `wake_on_progress`
- **THEN** wait continues toward completion or timeout without returning the progress or advancing its delivered revision

#### Scenario: Routine progress remains noisy
- **WHEN** an Agent continues publishing tool, hook, thinking, or response heartbeat revisions after an earlier opt-in progress delivery
- **THEN** the runtime retains the latest revision and adaptively delays eligibility across 5, 10, 20, then at most 30 seconds

#### Scenario: High-value phase changes during backoff
- **WHEN** retry, reconnect, or the first responding transition occurs during a routine progress cooldown
- **THEN** the new phase is immediately eligible for an opt-in progress wait and resets the adaptive interval

#### Scenario: A new turn starts after progress wait begins
- **WHEN** a current-root Agent turn is created after a root-wide `wake_on_progress: true` wait has blocked and then publishes progress
- **THEN** the same wait refreshes current active turns and returns that progress before timeout

#### Scenario: The same revision was already delivered
- **WHEN** an opt-in progress wait runs again and no Agent has a public-progress revision newer than its persisted delivered revision
- **THEN** that old milestone is not returned again during normal operation

#### Scenario: Two progress waits race on one revision
- **WHEN** two current-root opt-in progress waits concurrently observe the same pending progress revision
- **THEN** at most one claims that revision and the persisted delivered revision never regresses

#### Scenario: Two progress waits race across two pending Agents
- **WHEN** two current-root opt-in progress waits first observe the same oldest revision while another Agent also has pending progress
- **THEN** a waiter that loses the oldest claim reselects and may atomically claim the other pending Agent instead of falsely timing out

#### Scenario: Another root publishes progress
- **WHEN** a job owned by a different Codex root publishes a progress revision
- **THEN** the current root's wait does not observe or advance it
