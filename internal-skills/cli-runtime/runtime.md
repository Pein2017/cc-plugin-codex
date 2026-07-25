# Claude Code Direct Runtime Reference

The public `$cc:rescue` skill launches the tracked companion directly from the current Codex thread. This document records the command boundary; it is not a public skill.

Primary command:
`node "<plugin-root>/scripts/claude-companion.mjs" task ...`

- Use `task --background` for durable asynchronous work. The companion owns the detached worker, job state, recovery attempts, steering mailbox, and result receipts.
- Use foreground `task` only when the caller explicitly waits or the work is short and bounded.
- Do not spawn a disposable forwarding subagent.
- Preserve Claude runtime controls and literal prompt text. Use a temporary `--prompt-file` for multiline or shell-hostile text.
- For background launch, obtain `workspaceRoot`, reserved `jobId`, and owner routing with `background-routing-context --kind task --json` before invoking `task --background`.
- Pair a reserved job id with its returned `--cwd`. Pass `--owner-session-id` only when non-empty.
- Use `--view-state defer` for background and `--view-state on-success` for foreground.
- After launch, control the job with `status`, `steer`, `interrupt`, `cancel`, and `result`; do not create another process-control layer.
- Let the companion apply default Claude model and effort unless the user selected them.
