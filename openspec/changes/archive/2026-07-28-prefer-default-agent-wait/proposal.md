## Why

Codex callers are repeatedly spelling a short `--timeout-ms 60000` window even
though `wait_agent` already owns a suitable ten-minute default. This adds noisy
command text and causes avoidable timeout-driven re-invocation.

## What Changes

- Keep the existing 600000 ms runtime default and 3600000 ms maximum unchanged.
- Direct ordinary required joins to omit `--timeout-ms` and use the Plugin
  default.
- Reserve explicit timeout arguments for intentional immediate probes, shorter
  observation windows, or operator-selected longer bounds.
- Keep completion/progress early-return behavior and parent-turn wake-up limits
  unchanged.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `canonical-agent-orchestration`: Define omission of `timeout_ms` as the normal
  wait invocation and explicit bounds as an intentional override.

## Impact

Only the wait skill guidance, discovery metadata, contract tests, and canonical
orchestration spec change. The runtime, Agent state, Claude sessions, CLI
parser, timeout default, maximum, and completion latency do not change.
