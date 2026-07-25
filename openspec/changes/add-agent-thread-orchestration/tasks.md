## 1. Agent Registry

- [ ] 1.1 Define versioned Agent record, trusted root/name index, status mapping, session-root binding, and Agent-linked job/completion schemas; require `rootThreadId` to equal hardened `ownerRootId`.
- [ ] 1.2 Implement atomic root-scoped create/read/list/update operations, normalized name uniqueness, stable paths, and a separate operator-only read-only all-roots diagnostic.
- [ ] 1.3 Link every new internal job and completion event to one Agent and reconcile Agent state after crashes between job, inbox, and registry writes.
- [ ] 1.4 Persist and update the latest validated Claude session pointer plus `(CLAUDE_CONFIG_DIR, session) -> root, Agent` binding independently from bounded job receipts, preserving the previous pointer on session drift.
- [ ] 1.5 Implement pre-launch reservation rollback, receipt-proven safe fresh retry, activation-blocked state, and rejection of messages that would otherwise queue forever.
- [ ] 1.6 Add registry tests for duplicate names, trusted-root isolation, operator `--all`, foreign-session rejection, first-turn failure classes, concurrent activation, restart reconciliation, job pruning, and non-resident terminal Agents.

## 2. Canonical Runtime Operations

- [ ] 2.1 Implement `spawn_agent` with canonical `task_name`/`message`, explicit `fork_turns=none`, atomic Agent reservation, and Claude model/effort/profile extensions; reject unsupported context forks, service tier/agent type, and model-facing foreign-session adoption.
- [ ] 2.2 Implement `send_message` with active-turn durable delivery, terminal `queued_no_turn`, and activation-blocked rejection behavior.
- [ ] 2.3 Implement `followup_task` with active-turn delivery, idle exact-session activation, ordered queued-message consumption, and one-active-turn enforcement.
- [ ] 2.4 Implement target-free `wait_agent({timeout_ms?, acknowledge_tokens?})` so prior contiguous tokens are acknowledged first, newly returned oldest-unread activity stays unread, and response loss causes safe redelivery.
- [ ] 2.5 Implement `interrupt_agent` so graceful proven-safe interruption remains resumable, forced termination defaults to errored/non-resumable, and the Agent logical identity remains intact.
- [ ] 2.6 Implement read-only model-facing `list_agents({path_prefix?})` with root-scoped snapshots and repeatable unacknowledged completion reads; reject model-facing `all`.
- [ ] 2.7 Replace `runtime/index.mjs` atomically with exactly the six snake_case operations and add an interface-shape contract test.

## 3. Remove the Old Lifecycle Surface

- [ ] 3.1 Remove public `start/run`, `steer`, `status`, `result`, `followUp`, and `cancel` runtime/CLI routes without aliases or deprecation adapters.
- [ ] 3.2 Remove the old run, steer, interrupt, cancel, status, and result skills and their copied plugin snapshot entries.
- [ ] 3.3 Remove user-facing cancellation, active `cancelling/cancelled` routing, and their new-state transitions; retain identity-verified internal process termination only for interruption/stale cleanup and map internal `failed` to Agent `errored`.
- [ ] 3.4 Ensure legacy job files remain non-destructive diagnostic artifacts, are not auto-promoted into Agents, and continue through normal bounded cleanup.
- [ ] 3.5 Add negative tests proving every removed runtime method, CLI command, job-level `--all` diagnostic, and skill fails clearly without invoking a replacement implicitly.

## 4. Harness-aligned Plugin Surface

- [ ] 4.1 Add the six skills `spawn-agent`, `send-message`, `followup-task`, `wait-agent`, `interrupt-agent`, and `list-agents`, each delegating through the checkout bootstrap to its matching snake_case operation.
- [ ] 4.2 Update CLI help, rendered receipts, JSON schemas, README architecture/commands, migration table, and examples to address Agents rather than job IDs.
- [ ] 4.3 Document the precise V2 deviation table and add a separate user-authorized operator workflow for redacted `--all` diagnosis and foreign Terminal-session adoption with durable binding.
- [ ] 4.4 Update `CHANGELOG.md`, `package.json`, lockfile, marketplace metadata, and plugin manifest together to version `0.2.0`.
- [ ] 4.5 Run residue checks for old public skill names, API methods, cancellation commands/states, model-facing owner/all/session-adoption overrides, Sendbird dependencies, upstream installers, and executable versioned-Cache paths.

## 5. Verification and Local Installation

- [ ] 5.1 Add fake-Claude unit/integration/e2e tests for all six operations, multiple concurrent Agents, message ordering, exact-session follow-up, trusted-root isolation, two-phase completion delivery, first-turn failures, graceful/forced interruption, restart recovery, and native Windows/macOS process paths.
- [ ] 5.2 Run `npm run check` and retain the complete acceptance receipt.
- [ ] 5.3 Run a bounded real-Claude matrix with Agent A/B prompts `Reply exactly CC_AGENT_A_OK` and `Reply exactly CC_AGENT_B_OK`, follow-up `Reply exactly CC_AGENT_A_FOLLOWUP_OK`, at most two concurrent Agents, one Claude turn for each exact-response prompt, 180-second timeout per case, redacted receipts, and stop on first mismatch; verify later list/wait delivery. Then run one sequential interrupt case, capped at two Claude turns, whose only tool action is a 30-second Node timer; interrupt after its process receipt, and leave message-order breadth plus native-Windows/macOS behavior to fake-Claude tests.
- [ ] 5.4 After both prerequisites are archived, diff every MODIFIED/REMOVED requirement against materialized stable specs, record the resolved requirement matrix, then run strict validation, sync, and archive only when all acceptance evidence passes.
- [ ] 5.5 Reinstall the plugin from this local checkout, restart Codex, verify exactly the six new `$cc-for-pein:*` skills, and prove the installed bootstrap still delegates only to `CC_RUNTIME_CHECKOUT`.
