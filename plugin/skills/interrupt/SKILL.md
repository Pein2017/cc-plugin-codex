---
name: interrupt
description: 'Gracefully interrupt a running local Claude Code task by job id with SIGINT while preserving its exact session and partial output for follow-up. Use when the user wants work to stop at the current point but may resume it later; use cancel for destructive termination.'
---

# Claude Code Interrupt

Resolve `<plugin-root>` as two directories above this `SKILL.md` file. Run:
`node "<plugin-root>/bootstrap/cc-runtime.mjs" interrupt $ARGUMENTS`

The bootstrap must delegate to `CC_RUNTIME_CHECKOUT` from the selected
`.codex/.env`; never execute a runtime from the plugin Cache.

- Require a job id and interrupt only a running task.
- Treat interrupt as graceful and resumable. It never escalates to SIGKILL.
- Report the runtime stdout exactly. An `interrupted` job can continue with `$cc:steer --follow-up <job-id> <message>`.
- If the interrupt attempt fails, the job remains controllable; inspect `$cc:status` and use `$cc:cancel` only when destructive termination is intended.
