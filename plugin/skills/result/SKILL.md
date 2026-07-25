---
name: result
description: 'Show the stored final output for a finished Claude Code job in this repository. Args: [job-id]. Use when the user already has, or needs, a tracked job id.'
---

# Claude Code Result

Use this skill when the user wants the stored final output for a finished Claude Code job.

Resolve `<plugin-root>` as two directories above this `SKILL.md` file. Run:
`node "<plugin-root>/bootstrap/cc-runtime.mjs" result $ARGUMENTS`

The bootstrap must delegate to `CC_RUNTIME_CHECKOUT` from the selected
`.codex/.env`; never execute a runtime from the plugin Cache.

Supported arguments: `[job-id]`

Output:
- Present the full runtime stdout exactly as returned.
- Do not summarize or condense it.
