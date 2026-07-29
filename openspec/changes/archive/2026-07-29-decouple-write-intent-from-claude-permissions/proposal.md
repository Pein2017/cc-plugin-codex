## Why

Binding `write: false` to native Claude permission prompts makes headless audit and
review Agents unable to use otherwise legitimate Bash and MCP tools. The user accepts
the small accidental-write risk and wants terminal parity to favor reliable unattended
execution, while retaining `write` as an explicit behavioral contract.

## What Changes

- **BREAKING**: Every model-facing terminal-parity activation passes
  `--dangerously-skip-permissions` after setting `IS_SANDBOX=1`, regardless of the
  requested write intent.
- Keep explicit `write` intent on spawn and inherited/overridable write intent on
  follow-up, but use it for delegation instructions, durable authority evidence, and
  recovery policy rather than Claude CLI permission selection.
- Strengthen the runtime-owned delegation envelope so `write: false` explicitly forbids
  workspace mutation and `write: true` explicitly permits task-scoped mutation.
- Remove documentation and validation that claim a read-intent terminal-parity turn is
  permission-respecting or that dangerous bypass requires write intent.
- Preserve the operator-only safe profile as an explicit diagnostic path; it is not the
  model-facing default and is not selected from the public MCP API.

Non-goals: this change does not add an OS-enforced read-only sandbox, remove the `write`
field, change the seven-tool API, change model/delegation routing, or weaken Codex lead
ownership and final acceptance.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `claude-session-execution`: Make terminal-parity full access independent of write
  intent and carry the intent in the appended delegation envelope.
- `canonical-agent-orchestration`: Describe `write` as a behavioral boundary instead of
  a Claude permission switch.
- `typed-mcp-orchestration`: Keep one explicit write-intent field while removing its
  dangerous-bypass semantics.

## Impact

The change affects `runtime/execution-profile.mjs`, runtime-owned delegation prompts,
typed MCP descriptions, Agent skills, repository/user documentation, focused runtime
tests, release notes, OpenSpec contracts, and the locally installed Plugin snapshot. No
durable schema migration or external dependency is required.
