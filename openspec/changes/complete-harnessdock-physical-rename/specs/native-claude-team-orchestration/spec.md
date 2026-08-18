## MODIFIED Requirements

### Requirement: Every orchestrator turn uses one fresh native team
An orchestrating Claude Agent turn SHALL enable Claude Code's experimental Native
Agent Teams transport only for that process. The lead SHALL use named native
teammates rather than silently substituting ordinary unnamed subagents. The
team SHALL exist only inside the current Claude process/turn: a later CC
follow-up that resumes the parent Claude session SHALL form a new team and
SHALL NOT address or resume a teammate from the earlier process. The Plugin
SHALL NOT create durable Claude Agent identities, mailbox entries, completion
events, public receipts, or transcript pointers for native teammates.

#### Scenario: Lead starts a team
- **WHEN** an Opus or Fable orchestrator starts and native team admission succeeds
- **THEN** the first named teammate forms one Native Agent Team with the current Claude session as lead while the lead remains the only durable Claude Agent

#### Scenario: Named teammate and message prove team transport
- **WHEN** a correlated named Agent result proves asynchronous launch and a later correlated `SendMessage` to that launched member name succeeds
- **THEN** the runtime marks the current turn's native-team transport live-validated without treating init tool names or launch status alone as proof

#### Scenario: Same Claude Agent receives a follow-up turn
- **WHEN** a durable orchestrating Claude Agent resumes its parent Claude session in a new process
- **THEN** it forms a fresh native team and does not reuse the earlier process's in-process teammates

#### Scenario: Native team gate is unavailable
- **WHEN** Claude accepts the process but omits an injected definition, returns a non-asynchronous named Agent result, or fails to complete a correlated message to the launched member name
- **THEN** the turn fails as Harness-incompatible and does not accept ordinary-subagent output as native-team work

### Requirement: Team-size controls are classified by enforcement strength
The runtime SHALL inject instructions limiting one turn to at most three
simultaneously active teammates plus the lead and at most six teammate
creations in total. It SHALL retain the reviewed Claude concurrency environment
only as a residual guard on the forbidden ordinary-subagent path and SHALL NOT
claim that value constrains native teammates. It SHALL deny native `Agent` and
`Workflow` to every teammate. Because current Claude Code exposes no
unbypassable native-team concurrency or creation-count control, the Plugin
SHALL describe both numerical limits as behavioral cost and coordination
budgets, not as process-enforced facts. It SHALL retain native
no-nested-team behavior and member tool denial as the enforceable topology
boundary.

#### Scenario: Lead parallelizes independent work
- **WHEN** a team lead has three independent delegated tasks
- **THEN** its envelope instructs it to run at most three named teammates concurrently while the lead remains the only durable Claude Agent

#### Scenario: Team reaches its creation budget
- **WHEN** six teammate creations have already been requested during the turn
- **THEN** the lead instruction requires convergence without requesting a seventh and the final synthesis reports any budget uncertainty instead of claiming hard enforcement
