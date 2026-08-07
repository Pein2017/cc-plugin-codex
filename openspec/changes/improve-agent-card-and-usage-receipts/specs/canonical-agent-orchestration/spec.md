## MODIFIED Requirements

### Requirement: Spawn skill presents a concise acknowledgement by default
The `spawn-agent` skill SHALL receive one bounded successful Agent Card containing stable `agent_name`, exact `model`, requested `reasoning_effort` when known, explicit behavioral `authority`, immutable `delegation_mode`, bounded lifecycle `status`, safe observed `phase`, `started_at`, `last_activity_at`, and query-time `elapsed_seconds`. It SHALL present one concise acknowledgement derived from the selected model, role, authority, name, and status. It SHALL NOT print raw JSON or expose Agent IDs, workspace, native session/config, job pointers, continuation, mailbox, tool inputs, paths, or persistence internals; deeper evidence SHALL use the operator diagnostics path. Actionable error or recovery information SHALL remain visible when spawn fails.

#### Scenario: Agent starts successfully
- **WHEN** `spawn-agent` receives a successful bounded Agent Card
- **THEN** Codex reports the selected model, concise role, behavioral authority, stable Agent name, and current status without dumping JSON or internal state

#### Scenario: Optional evidence is not yet observed
- **WHEN** effort, phase, or activity timestamps are not present in the accepted turn evidence
- **THEN** the corresponding Agent Card fields are `null` rather than inferred from defaults, labels, elapsed silence, or prose

#### Scenario: Deeper diagnostics are requested
- **WHEN** the user needs Agent ID, session, job, continuation, workspace, mailbox, command, path, or raw receipt evidence
- **THEN** the ordinary Agent Card remains bounded and the operator diagnostics path is used instead

#### Scenario: Spawn fails or requires recovery
- **WHEN** spawn fails or reaches an actionable recovery condition
- **THEN** Codex reports the actionable condition instead of hiding it behind a generic concise success message

### Requirement: list_agents reports logical state and unread completions
`list_agents` SHALL accept only the canonical optional `path_prefix` and return every matching current-root logical Agent, including nonresident terminal history, as a compact Agent Card. Each card SHALL contain canonical `agent_name`, exact selected `model`, requested `reasoning_effort` when retained, explicit behavioral `authority`, immutable `delegation_mode`, bounded `agent_status`, safe observed `phase`, `started_at`, `last_activity_at`, and query-time `elapsed_seconds`. The status projection SHALL use only `starting`, `working`, `completed`, `failed`, and `interrupted`, mapping durable `pending_init`, `running`, `completed`, `errored`, and `interrupted` respectively without renaming stored lifecycle facts. Missing retained job evidence SHALL project nullable fields as `null`. The card SHALL NOT infer liveness or attention from elapsed silence and SHALL NOT return progress summaries, completion-inbox records, delivery tokens, final output, reconciliation receipts, tool inputs, paths, commands, or storage metadata. Listing SHALL neither consume the one-progress budget nor acknowledge completion. Cross-root `--all` SHALL exist only in the separate operator CLI.

#### Scenario: Codex resumes after background completion
- **WHEN** the root later calls `list_agents`
- **THEN** it can discover the completed nonresident Agent with status `completed`, model, behavioral authority when retained, and immutable delegation mode without receiving final output

#### Scenario: Active Agent has safe activity evidence
- **WHEN** a retained active job has a public-progress phase and timestamp
- **THEN** its card reports the closed safe phase, start/activity times, and elapsed seconds without consuming or returning the progress summary

#### Scenario: Detailed job evidence was pruned
- **WHEN** a logical Agent remains but its latest detailed job no longer exists
- **THEN** its stable identity, model, delegation mode, and lifecycle remain visible while effort, authority, phase, and timing fields that cannot be proven are `null`

#### Scenario: Errored Agent is projected
- **WHEN** a durable Agent has internal lifecycle `errored`
- **THEN** the model-facing list reports `failed` while operator evidence retains the exact internal failure state

#### Scenario: Repeated list observes state only
- **WHEN** the root calls `list_agents` repeatedly
- **THEN** it receives logical cards without reading, claiming, or acknowledging completion or progress delivery

#### Scenario: Path prefix narrows the tree
- **WHEN** the caller supplies `path_prefix`
- **THEN** only current-root Agents whose stable paths match that prefix are returned

