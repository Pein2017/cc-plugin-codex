---
name: rescue
description: 'Launch a tracked Claude Code task from the current Codex thread through the checkout-owned local runtime. Supports safe and terminal-parity profiles, durable background execution, wait mode, explicit Claude session resume, environment files, write mode, and model or effort overrides. Use when Claude Code should investigate, implement, or continue work while Codex retains lifecycle control.'
---

# Claude Code Rescue

Run the local runtime directly from the user-facing Codex thread. Do not create a forwarding subagent.

Resolve `<plugin-root>` as two directories above this `SKILL.md` file. The
bootstrap must delegate to `CC_RUNTIME_CHECKOUT` from the selected
`.codex/.env`; it never falls back to a runtime in the plugin Cache. Run:
`node "<plugin-root>/bootstrap/cc-runtime.mjs" start ...`

Raw arguments: `$ARGUMENTS`

Rules:

- Ask for a task only when no task text or prompt file was supplied.
- Default to `--write` unless the user explicitly requests read-only work.
- Default to `--profile safe`. Use `--profile terminal-parity` when the user wants the same Claude plugins, hooks, skills, MCP servers, memory, permission behavior, model default, and effort default as direct Terminal Claude Code.
- Preserve `--model`, `--effort`, `--permission-mode`, `--dangerously-skip-permissions`, `--allowed-tools`, `--prompt-file`, `--resume-session`, `--env-file`, and literal task text. A leading Claude slash command is task text, not a Codex command.
- Use `--dangerously-skip-permissions` only when the user explicitly requests unrestricted native Claude authority. Pair it with `--profile terminal-parity`; the runtime sets `IS_SANDBOX=1` for that Claude child and records the override. Never add it implicitly or combine it with `--permission-mode`.
- Treat `--resume-session <uuid>` as exact-session continuation. Never select a global latest session implicitly.
- Start in the background by default. Add `--wait` only when the user asks to wait for the terminal result.
- Stage multiline or shell-hostile prompts in a temporary prompt file outside the repository and pass `--prompt-file`.
- Present runtime stdout faithfully. Do not poll a background task in the launch turn unless the user asked to wait.
- On readiness or authentication failure, run `node "<plugin-root>/bootstrap/cc-runtime.mjs" readiness` and report the concrete repair.

Use `$cc:steer <job-id> <message>` for live course changes. Use `$cc:steer --follow-up <job-id> <message>` only after a completed or interrupted job.
