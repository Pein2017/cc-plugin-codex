## Why

`claude_orchestrator` currently permits only Fable and gives it an opaque,
prompt-bounded child generation. That leaves useful Claude-native teamwork
underused. Claude Code 2.1.227 now exposes experimental Agent Teams with named
teammates, a shared task list, automatic completion/idle delivery, and direct
peer messaging, while also exposing cross-session and tool-input capabilities
that can silently exceed the Plugin's root, cost, and lifecycle boundaries.

## What Changes

- Keep `leaf` strict while allowing exact Opus 5 or Fable 5 to act as an
  explicit `claude_orchestrator`, presented as a native team lead.
- Enable Claude Code's experimental Native Agent Teams transport only for an
  explicit Opus/Fable orchestrator. If the native gate or injected definitions
  are unavailable, the runtime refuses to accept the turn as native-team work.
  Definition/tool names at initialization are necessary but not sufficient.
  The Adapter translates Claude's versioned tool results into stable internal
  facts: a named member must launch asynchronously, then a correlated
  `SendMessage` to that launched member name must succeed. Otherwise the turn
  fails observably instead of silently accepting ordinary unnamed-subagent work.
- Give a team lead three session-local named teammate definitions:
  `haiku-scout`, `sonnet`, and `opus`. Sonnet and Opus may implement or review;
  Haiku remains a prompt-governed read-only scout.
- Instruct each team-lead turn to use one fresh native team, at most three
  concurrently active teammates plus the lead, and at most six teammate
  creations in total. The runtime retains a concurrency environment value only
  as a residual guard on the forbidden ordinary-subagent path and hard-denies
  member Agent/Workflow; it does not misdescribe native-team creation or
  concurrency budgets as process limits.
- Require every internal delegation brief to state model, intended effort,
  role, authority, write surface, acceptance evidence, and stop boundary.
  The lead selects the exact pinned member definition without a call-level
  model override; effective effort inherits the lead because Claude Code has
  no per-teammate effort, and the final synthesis distinguishes intended from
  inherited or unknown effort.
- Enable Claude-native `memory: local` for the three stable member identities,
  while leaving the top-level CC Agent on the existing native Auto Memory path.
  The Plugin does not read, copy, merge, lock, or expose memory contents.
- Permit the current native team to use its shared tasks, idle notifications,
  and `SendMessage` for evidence and blocker handoff, while prompt-forbidding
  cross-session recipients and peer-driven completed-teammate resume.
- Harden the tool envelope: universally deny Workflow and high-blast-radius
  machine/session tools; keep native Agent and SendMessage unavailable to
  leaves and available only to an explicit team lead/cohort as needed.
- Extend zero-model compatibility and doctor evidence to detect missing
  required CLI/definition surface, canonicalize the init alias `Task` to
  `Agent`, detect reviewed forbidden-tool leakage, and warn on unknown native
  tool drift without claiming universal containment.
- Add a release-gated real `claude-opus-5`/`low`, `write:false` smoke observing
  the native definition, named-member launches, validated same-team transport,
  and successful parent
  synthesis facts the production stream can actually expose, plus no task-state
  mutation outside explicitly allowed local-memory maintenance. Claude 2.1.227
  exposes teammate idle/completion through native mailbox delivery and optional
  hooks, not a stable top-level stream event, so the witness records settle as
  unobservable instead of inventing an event. Account-limit errors stop further
  paid Claude testing.

The public seven-tool MCP topology and `delegation_mode` enum do not change.
`write` remains behavioral authority under terminal parity, not a filesystem
sandbox.

## Capabilities

### New Capabilities

- `native-claude-team-orchestration`: define the bounded Native Agent Team,
  experimental-gate dependency, member roles,
  memory, communication, delegation, join, and final-synthesis contract inside
  one orchestrating CC Agent turn.

### Modified Capabilities

- `canonical-agent-orchestration`: change orchestrator eligibility from
  Fable-only to Opus-or-Fable, add the hard top-level model/write role matrix,
  and keep the existing public API unchanged.
- `claude-session-execution`: compose session-local Agent definitions, an
  orchestrator-only Agent Teams environment, mode-specific tool denials, and a
  fresh team on every orchestrator activation while bumping the Driver contract.
- `claude-version-compatibility`: admit only Claude executables that expose the
  CLI surfaces required for session-local native teams and bounded tool
  composition.
- `runtime-operations-diagnostics`: report forbidden and unknown Claude tool
  surface drift without exposing prompts, memory, sessions, or credentials.
- `plugin-release-readiness`: require an explicit Opus-low native-team witness
  for this capability in addition to the zero-cost default release checks.

## Impact

The change affects execution-profile validation and argument construction,
Claude adapter serialization, fixed child environment composition, the Claude
Driver contract version, zero-model compatibility/doctor probes, Plugin skill
guidance, focused fake-Claude tests, and release smoke coverage. It explicitly
depends on Claude Code's experimental Native Agent Teams transport, but adds no
runtime package dependency, public MCP field, Plugin-side child registry,
cross-session broker, or memory database.

Non-goals are cross-top-level `same_root` messaging, arbitrary cross-session
recipients, machine-global `ListAgents`, Workflow, teammate worktree/remote
isolation, nested teammate delegation, per-teammate durable CC identity, child
transcript ingestion, cost accounting inferred from native teammates, or
enforcement that claims prompt-level write, team-size, and effort intent are
OS/runtime capabilities.

Lifecycle ordering is: specify the bounded team and role matrix; add red
contract/argument/compatibility tests; implement profile and adapter changes;
update diagnostics and skills; run zero-cost verification; then run one paid
witness per explicit authorization with no automatic paid retry. Installation,
merge, release, and publication remain
separate later actions.
