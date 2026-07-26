## Why

The current Agent runtime still defaults a model, requires an opt-in for Claude
full access, and exposes completion payloads much more broadly than Codex
Multi-Agent V2. These defaults make launches less explicit, block configured
Serena MCP calls under headless Claude, and can flood a later Codex turn with
old final output.

## What Changes

- **BREAKING** Require every initial `spawn_agent` request to select exactly
  Sonnet or Opus; remove the implicit Opus default.
- Migrate pre-v0.3 Agent records without a selected model only from exact
  retained receipt or Claude session evidence; preserve but continuation-block
  terminal unsupported/unproven history instead of substituting a model, while
  allowing a located unproven artifact to restore continuation if exact support
  is proven later.
- **BREAKING** Make the Claude child use the native full-access launcher by
  default: resolve the effective Claude config directory, set `IS_SANDBOX=1`,
  and pass `--dangerously-skip-permissions` before starting headless Claude.
- Align `wait_agent` and `list_agents` default model-visible receipts with
  Codex Multi-Agent V2: bounded status and completion summaries without final
  Agent output or duplicated inbox batches.
- Preserve durable at-least-once delivery and acknowledgement as an internal CC
  extension, while quarantining legacy unowned completion events so they cannot
  block current Agent activity.
- Make all six lifecycle skills model-visible and replace the destructive local
  reinstall loop with checkout-hot runtime updates plus an atomic plugin refresh
  for discovery metadata.
- Update the supported Linux contract, tests, release metadata, and installation
  guidance. Codex host permission policy remains out of scope.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `canonical-agent-orchestration`: Require an explicit model on spawn and align
  list/wait presentation with Codex V2.
- `claude-session-execution`: Make the Claude child full-access launch envelope
  the default and remove the implicit model selection.
- `completion-delivery`: Separate durable stored detail from bounded
  model-visible completion summaries and handle legacy unowned events.
- `local-runtime-boundary`: Define effective Claude config precedence and the
  checkout-hot/plugin-refresh development loop without upstream influence.

## Impact

This changes spawn validation, execution-profile construction, environment
normalization, completion projections, list/wait receipts, skill metadata,
local installation scripts, OpenSpec contracts, tests, and release metadata.
The six-operation public lifecycle surface and stored Claude Code session
artifacts remain intact. The independent Pein2017 clone is the sole Git source;
`/data/CoordExp/external/cc-plugin-codex` remains reference-only and is not a
runtime, install, worktree, remote, or merge dependency.
