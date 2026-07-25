---
name: cancel
description: 'Destructively cancel an active local Claude Code job by job id. Use when the user wants a queued or running job terminated and does not want graceful resumability; prefer interrupt when the session may be continued.'
---

# Claude Code Cancel

Use this skill when the user wants to terminate an active Claude Code job. Prefer `$cc:interrupt` when preserving a resumable Claude session matters.

Resolve `<plugin-root>` as two directories above this `SKILL.md` file. Run:
`node "<plugin-root>/bootstrap/cc-runtime.mjs" cancel $ARGUMENTS`

The bootstrap must delegate to `CC_RUNTIME_CHECKOUT` from the selected
`.codex/.env`; never execute a runtime from the plugin Cache.

Supported arguments: `<job-id>`

Output:
- Present the runtime stdout exactly as returned.
- Do not add extra prose unless the command itself failed before producing output.
