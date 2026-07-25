---
name: steer
description: 'Send a durable course-correction message to an active tracked Claude Code task, or explicitly resume a completed/interrupted task as an exact-session follow-up. Accepts a job id, optional follow-up flag, and message. Use when the user wants to redirect, refine, or continue a specific Claude job without cancelling it.'
---

# Claude Code Steer

Resolve `<plugin-root>` as two directories above this `SKILL.md` file.

- Run `node "<plugin-root>/bootstrap/cc-runtime.mjs" steer $ARGUMENTS` for an active job.
- When `$ARGUMENTS` contains `--follow-up`, remove that flag and run `node "<plugin-root>/bootstrap/cc-runtime.mjs" follow-up <job-id> <message>`.

The bootstrap must delegate to `CC_RUNTIME_CHECKOUT` from the selected
`.codex/.env`; never execute a runtime from the plugin Cache.

- For a queued or running job, call with `<job-id> <message>`. The companion persists the message before returning and delivers it on the live stdin stream or next recovery attempt.
- For a completed or interrupted job, require `--follow-up`. This creates a new tracked job on the exact prior Claude session instead of mutating historical results.
- Do not use `--follow-up` for an active job.
- Preserve the user's steering text literally; use normal argument quoting when needed.
- Present the runtime receipt exactly. It includes job id, delivery mode, and sequence or follow-up job id.
