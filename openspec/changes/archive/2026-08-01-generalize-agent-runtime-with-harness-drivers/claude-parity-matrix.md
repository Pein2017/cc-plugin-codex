# Claude extraction: module ownership and no-observable-change parity matrix

This record freezes what the `claude-code` Driver extraction may and may not
change. Every row is a behavior that existed before the Harness boundary; the
extraction is accepted only when the listed evidence still passes unchanged.

## Module ownership after extraction

| Concern | Owner | Boundary |
| --- | --- | --- |
| Agent identity, mailbox, jobs, leases, completion delivery, wait/progress budget, retention, reconciliation | `runtime/agent-runtime.mjs`, `runtime/agent-store.mjs`, `runtime/job-store.mjs`, `runtime/completion-inbox.mjs` | Supervisor |
| Turn preparation, worker handoff, process identity, durable job receipts | `runtime/internal-runtime.mjs`, `runtime/job-runner.mjs` | Supervisor |
| Capability vocabulary, normalized turn result, native-session identity, bounded Driver receipts | `runtime/harness-capabilities.mjs`, `runtime/harness-contract.mjs` | Contract |
| Static Driver resolution and selector refusal | `runtime/harness-registry.mjs` | Contract |
| Claude executable, auth, model/effort catalog, argv, stream-json, sandbox settings, process control | `runtime/claude-headless-adapter.mjs` | Driver-owned |
| Claude CLI overrides, delegation prompt, tool denial, terminal-parity environment | `runtime/execution-profile.mjs` | Driver-owned |
| Claude version fingerprint and drift gate | `runtime/claude-version-compatibility.mjs` | Driver-owned |
| One logical Claude session across attempts, bounded reconnect, steering pump, session-drift refusal | `runtime/job-supervisor.mjs` | Driver-owned |
| Native outer-assistant history | `runtime/claude-session-history.mjs` | Driver-owned |
| Composition of all of the above into one turn | `runtime/claude-code-driver.mjs` | Driver |

`runtime/claude-code-driver.mjs` composes; it re-implements none of the owners
above. The supervisor reaches Claude only through the Driver's coarse
`preflight`, `describeUnreadiness`, `validatePreparedPreflight`, `revalidatePreparedPreflight`,
`validateRoute`, `resolveInstanceKey`, `startTurn`, `assignInput`, `interruptTurn`,
`cancelTurn`, and optional `readAssistantHistory` operations.

## No-observable-change parity matrix

| # | Frozen behavior | Evidence |
| --- | --- | --- |
| 1 | Admitted models are exactly haiku/sonnet/opus/fable with their alias forms and per-model default effort | `tests/runtime/harness-claude-parity.test.mjs`, `tests/runtime/execution-profile.test.mjs` |
| 2 | Every admitted effort (`low`…`max`) is accepted with every admitted model | `tests/runtime/harness-claude-parity.test.mjs` |
| 3 | `claude_orchestrator` requires exact `claude-fable-5`; leaf is the default topology | `tests/runtime/harness-claude-parity.test.mjs`, `tests/runtime/execution-profile.test.mjs` |
| 4 | `terminal-parity` always sets `IS_SANDBOX=1` and `--dangerously-skip-permissions` | `tests/runtime/harness-claude-parity.test.mjs`, `tests/runtime-integration/runtime-cli.test.mjs` |
| 5 | Leaf denies `Agent` and `Workflow`; the Fable orchestrator denies only `Workflow` | `tests/runtime/harness-claude-parity.test.mjs` |
| 6 | Write intent stays a prompt-level authority statement, never a process permission switch | `tests/runtime/harness-claude-parity.test.mjs`, `tests/runtime-integration/runtime-cli.test.mjs` |
| 7 | Session name is passed only for a fresh turn; `--resume` targets the exact prior session | `tests/runtime/harness-claude-parity.test.mjs`, `tests/runtime-integration/runtime-cli.test.mjs` |
| 8 | Active steering is dispatched durably and acknowledged from the live stream | `tests/runtime/agent-message-idempotency.test.mjs`, `tests/runtime-integration/runtime-cli.test.mjs` |
| 9 | Exact-session drift fails the turn and preserves the prior Agent session pointer | `tests/runtime/supervisor.test.mjs`, `tests/runtime/harness-state-migration.test.mjs` |
| 10 | Bounded transport recovery resumes only the captured session | `tests/runtime/supervisor.test.mjs` |
| 11 | Account/usage-limit exhaustion is terminal and never retried through another route | `tests/runtime/adapter.test.mjs`, `tests/runtime/harness-driver-contract.test.mjs` |
| 12 | Graceful interruption preserves resume safety; forced termination is non-resumable | `tests/runtime/agent-launch-boundary.test.mjs`, `tests/runtime/process-control.test.mjs` |
| 13 | Native history returns bounded outer-assistant text without activating the Agent | `tests/runtime/claude-session-history.test.mjs`, `tests/runtime/harness-claude-parity.test.mjs` |
| 14 | Version incompatibility fails closed before launch | `tests/runtime/claude-version-compatibility.test.mjs` |
| 15 | The seven public operations, their receipts, and the typed MCP schemas are unchanged | `tests/runtime/plugin-contract.test.mjs`, `tests/runtime/mcp-server.test.mjs` |
| 16 | Model-facing wait stays completion-first with one non-hook progress update per job | `tests/runtime/agent-progress-projection.test.mjs`, `tests/runtime/harness-driver-contract.test.mjs` |

Expectations in the evidence column were not relaxed to accommodate the
abstraction. Where a fixture changed, it changed only because the durable
version-2 record renamed a stored field (`claudeSessionId`/`claudeConfigDir` →
`nativeSessionRef`) or because a store now receives its Driver contract
explicitly; no asserted behavior was weakened.
