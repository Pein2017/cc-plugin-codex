## 1. Agent Registry

- [x] 1.1 Define versioned Agent record, logical root/name index, flat path, separate active/latest job pointers, lifecycle/continuation mapping, session-root binding, and Agent-linked job/completion schemas; require `rootThreadId` to equal hardened `ownerRootId`.
- [x] 1.2 Implement atomic root-scoped create/read/list/update operations, normalized name uniqueness, stable paths, and a separate operator-only read-only all-roots diagnostic.
- [x] 1.3 Link every new internal job and completion event to one Agent, treat terminal job receipts as the fact source, and reconcile rebuildable Agent/inbox projections after crashes.
- [x] 1.4 Persist and update the latest validated Claude session pointer plus `(CLAUDE_CONFIG_DIR, session) -> root, Agent` binding independently from bounded job receipts, preserving the previous pointer on session drift.
- [x] 1.5 Implement pre-launch reservation rollback, receipt-proven safe fresh retry, `continuation=blocked` evidence, and rejection of messages that would otherwise queue forever without adding an activation-blocked lifecycle status.
- [x] 1.6 Add registry tests for duplicate names, logical-root isolation, operator `--all`, flat exact targeting, foreign-session rejection, first-turn failure classes, concurrent activation, restart reconciliation, job pruning, and nonresident terminal Agents.

## 2. Agent Mailbox

- [x] 2.1 Define a versioned Agent-level message schema and atomic `queued -> assigned(jobId) -> dispatched -> acknowledged` transitions independent from job receipt retention.
- [x] 2.2 Implement ordered enqueue, assignment to exactly one active job, delivery/acknowledgement reconciliation, and preservation of queued entries across terminal idle periods and restarts.
- [x] 2.3 Add concurrency, crash-window, active delivery, terminal queue, follow-up assignment, duplicate-dispatch prevention, and pruning-independence tests.

## 3. Canonical Runtime Operations

- [x] 3.1 Implement `spawn_agent` with canonical `task_name`/`message`, explicit `fork_turns=none`, atomic Agent reservation, flat `/root/<task_name>` path, and Claude model/effort/profile extensions; reject unsupported context forks, service tier/agent type, and any foreign-session adoption.
- [x] 3.2 Implement `send_message` through the Agent mailbox with active-turn durable delivery, terminal `queued_no_turn`, and blocked-continuation rejection behavior.
- [x] 3.3 Implement `followup_task` with active-turn delivery, idle exact-session or safe-fresh activation, atomic queued-message assignment, and one-active-turn enforcement.
- [x] 3.4 Implement target-free `wait_agent({timeout_ms?, acknowledge_tokens?})` so prior contiguous tokens are acknowledged first, newly returned oldest-unread activity stays unread, and response loss causes safe redelivery.
- [x] 3.5 Implement `interrupt_agent` so graceful proven-safe interruption remains resumable, forced termination defaults to errored/non-resumable, and the Agent logical identity remains intact.
- [x] 3.6 Implement read-only model-facing `list_agents({path_prefix?})` with root-scoped nonresident history and repeatable unacknowledged completion reads; reject model-facing `all`.
- [x] 3.7 Replace `runtime/index.mjs` atomically with exactly the six snake_case operations and add an interface-shape contract test.

## 4. Remove the Old Lifecycle Surface

- [x] 4.1 Remove public `start/run`, `steer`, `status`, `result`, `followUp`, and `cancel` runtime/CLI routes without aliases or deprecation adapters.
- [x] 4.2 Remove the old run, steer, interrupt, cancel, status, and result skills and their copied plugin snapshot entries.
- [x] 4.3 Remove user-facing cancellation, active `cancelling/cancelled` routing, and their new-state transitions; retain identity-verified internal process termination only for interruption/stale cleanup and map internal `failed` to Agent `errored`.
- [x] 4.4 Ensure legacy job files remain non-destructive diagnostic artifacts, are not auto-promoted into Agents, and continue through normal bounded cleanup.
- [x] 4.5 Add negative tests proving every removed runtime method, CLI command, job-level `--all` diagnostic, and skill fails clearly without invoking a replacement implicitly.

## 5. Harness-aligned Plugin Surface

- [x] 5.1 Add the six skills `spawn-agent`, `send-message`, `followup-task`, `wait-agent`, `interrupt-agent`, and `list-agents`, each delegating through the checkout bootstrap to its matching snake_case operation.
- [x] 5.2 Update CLI help, rendered receipts, JSON schemas, README architecture/commands, migration table, and examples to address Agents rather than job IDs.
- [x] 5.3 Document the precise V2 deviation table, read-only operator `--all` diagnosis, flat topology, nonresident listing behavior, and explicit deferral of Terminal-session adoption.
- [x] 5.4 Update `CHANGELOG.md`, `package.json`, lockfile, marketplace metadata, and plugin manifest together to version `0.2.0`.
- [x] 5.5 Run residue checks for old public skill names, API methods, cancellation commands/states, model-facing owner/all/session-adoption overrides, Sendbird dependencies, upstream installers, and executable versioned-Cache paths.

## 6. Verification and Local Installation

- [x] 6.1 Add fake-Claude unit/integration/e2e tests for all six operations, multiple concurrent Agents, Agent-mailbox ordering, exact-session follow-up, logical-root isolation, two-phase completion delivery, first-turn failures, graceful/forced interruption, restart recovery, and native Windows/macOS process paths.
- [x] 6.2 Run `npm run check` and retain the complete acceptance receipt.
- [x] 6.3 Run a bounded real-Claude matrix with Agent A/B prompts `Reply exactly CC_AGENT_A_OK` and `Reply exactly CC_AGENT_B_OK`, follow-up `Reply exactly CC_AGENT_A_FOLLOWUP_OK`, at most two concurrent Agents, one Claude turn for each exact-response prompt, 180-second timeout per case, redacted receipts, and stop on first mismatch; verify later list/wait delivery. Then run one sequential interrupt case, capped at two Claude turns, whose only tool action is a 30-second Node timer; interrupt after its process receipt, and leave message-order breadth plus native-Windows/macOS behavior to fake-Claude tests.
- [x] 6.4 After both prerequisites are archived, diff every MODIFIED/REMOVED requirement against materialized stable specs, record the resolved requirement matrix, then run strict validation, sync, and archive only when all acceptance evidence passes.
- [x] 6.5 Reinstall the plugin from this local checkout and verify the installed snapshot contains exactly the six new `$cc-for-pein:*` skills and delegates only to `CC_RUNTIME_CHECKOUT`; record Codex restart/reload verification as a post-install user step.
