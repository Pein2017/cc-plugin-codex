## ADDED Requirements

### Requirement: Claude background-task completion uses verified native evidence
The Claude Headless adapter SHALL classify clean turn completion from process exit, terminal result, and any recognized native owned-work lifecycle supported by pinned compatibility evidence. It SHALL NOT derive working, waiting, detached, completed, or failed state from assistant prose, arbitrary OS descendant discovery, interactive-only behavior, or an unrecognized event payload. Until a stable background-task protocol is evidenced, the existing process-close plus terminal-result rule SHALL remain authoritative and the runtime SHALL report that background ownership is unproven rather than claiming parity.

#### Scenario: Claude process remains alive
- **WHEN** the admitted Claude child has not closed
- **THEN** the runtime does not publish a terminal Agent completion regardless of assistant text

#### Scenario: Assistant says it is waiting
- **WHEN** a successful outer-assistant message says that work is waiting but no native owned-work evidence remains open
- **THEN** the prose does not override the structured terminal lifecycle

#### Scenario: Recognized must-join task remains open
- **WHEN** a successful terminal result conflicts with a recognized native task that remains owned and unfinished
- **THEN** the Driver does not normalize the turn as cleanly completed

#### Scenario: Native protocol marks work detached
- **WHEN** pinned native evidence explicitly removes a task from current-turn ownership before terminal success
- **THEN** that detached task does not block clean completion

#### Scenario: Detachment is described only in prose
- **WHEN** Claude text claims a background command was detached but structured native evidence still tracks it as owned
- **THEN** the task remains must-join and the prose has no lifecycle authority

#### Scenario: Background lifecycle is not proven
- **WHEN** the pinned Headless probe exposes no stable task identity and lifecycle
- **THEN** implementation stops without inventing task-state parsing or process-tree supervision

### Requirement: Claude protocol drift evidence is bounded and sanitized
The Claude Driver SHALL retain a bounded summary of unknown top-level event types and safe subtypes sufficient to diagnose protocol drift. It SHALL NOT persist arbitrary unknown payload values, tool inputs, hook bodies, prompts, proxy values, credentials, or native session content through that summary.

#### Scenario: Unknown event is observed
- **WHEN** stream-json contains an unrecognized top-level type or system subtype
- **THEN** the turn's Driver-local evidence records only its bounded type/subtype identity and count

#### Scenario: Unknown event has a large payload
- **WHEN** an unrecognized event contains arbitrary or multi-megabyte fields
- **THEN** those values are discarded and the persisted diagnostic remains within its entry and byte bounds

#### Scenario: Unknown event accompanies terminal success
- **WHEN** no recognized contradiction exists and a successful result is accompanied only by unknown event metadata
- **THEN** the diagnostic is retained without silently reinterpreting the event as background-task state

### Requirement: Real background protocol evidence is pinned and cost bounded
The change SHALL record one sanitized repository evidence artifact containing the admitted Claude executable fingerprint/version, exact probe cases, raw-event shape summary, process/result ordering, marker outcomes, and conclusion boundary. The real-model probe SHALL default to `claude-haiku-4-5` with low effort and SHALL stop further Claude calls on explicit account, subscription, usage, credit, allowance, or quota exhaustion.

#### Scenario: Probe completes normally
- **WHEN** the isolated Headless matrix finishes without an account-limit failure
- **THEN** the evidence artifact distinguishes observed facts from inferences and identifies the exact protocol behavior admitted for implementation

#### Scenario: Account capacity is exhausted
- **WHEN** any real probe returns explicit account-capacity exhaustion
- **THEN** all remaining real Claude probes stop and fixture/local planning may continue without model substitution
