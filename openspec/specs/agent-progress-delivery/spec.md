# agent-progress-delivery Specification

## Purpose
TBD - created by archiving change improve-agent-wait-progress. Update Purpose after archive.
## Requirements
### Requirement: Jobs publish only bounded safe progress activity
Each active Agent job SHALL maintain an optional monotonic public-progress revision containing only a bounded activity kind, phase, sanitized summary, and timestamp. The public projection SHALL NOT contain Claude response or thinking text, tool inputs, file paths, hook payloads, session IDs, partial output, or raw receipts. Only a fixed trusted allowlist of native tool names SHALL be model-visible; every other tool name SHALL become a generic tool milestone.

#### Scenario: Claude invokes a tool
- **WHEN** the Claude stream reports a tool-use event
- **THEN** the job publishes a bounded milestone containing at most an allowlisted native tool name and no tool arguments or paths

#### Scenario: Tool name is unknown or path-shaped
- **WHEN** the Claude stream reports an MCP, unknown, malformed, encoded, or path-shaped tool name
- **THEN** public progress says only that Claude is using a tool and contains no substring from that name

#### Scenario: Claude emits response tokens
- **WHEN** the Claude stream emits repeated text or thinking deltas
- **THEN** the runtime coalesces and rate-limits generic activity milestones without persisting those deltas in public progress

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

### Requirement: Progress never outranks completion
Unread Agent completion events SHALL be selected before pending progress revisions, and progress delivery SHALL remain advisory rather than terminal evidence.

#### Scenario: Progress and completion are both pending
- **WHEN** a current-root progress revision and unread completion event are available together
- **THEN** wait returns the completion event and leaves the progress hint non-authoritative

#### Scenario: Completion arrives during progress cooldown
- **WHEN** a current-root Agent completes before its next progress heartbeat is eligible
- **THEN** wait returns the completion promptly without waiting for the progress interval

#### Scenario: Wait times out after earlier progress
- **WHEN** all observed progress revisions have already been delivered and no completion arrives before the deadline
- **THEN** wait returns a timeout without failing, interrupting, or completing an Agent
