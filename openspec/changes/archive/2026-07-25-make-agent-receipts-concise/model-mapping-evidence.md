# Claude model-mapping evidence

Date: 2026-07-25

## Observed defect

An external Agent receipt reported `claude-opus-4-7[1m]` after the caller chose
`opus/xhigh`. Source inspection found that the runtime, rather than Claude Code,
was rewriting the public `opus` input through a stale hard-coded alias table:

```text
opus   -> claude-opus-4-7[1m]
sonnet -> claude-sonnet-4-6[1m]
haiku  -> claude-haiku-4-5
```

The table has been replaced with a closed allowlist whose only outputs are
`claude-opus-5` and `claude-sonnet-5`.

## Current-name verification

- Installed CLI: Claude Code `2.1.220`.
- Official Anthropic model documentation identifies the current full model IDs
  as `claude-opus-5` and `claude-sonnet-5`.
- Low-effort headless probes in
  `/data/CoordExp/.worktrees/research-probes`, with
  `CLAUDE_CONFIG_DIR=/data/CoordExp/.claude` and both cases of the HTTP, HTTPS,
  and ALL proxy variables pinned to `http://127.0.0.1:9090`, succeeded with the
  two exact full IDs.
- Alias-only probes showed Claude Code resolving `opus` and `sonnet` to the same
  two main-model IDs, but the plugin now passes the full IDs to avoid alias
  drift.

Official references:

- <https://platform.claude.com/docs/en/about-claude/models/overview>
- <https://platform.claude.com/docs/en/about-claude/model-deprecations>
- <https://docs.anthropic.com/en/docs/claude-code/cli-usage>

## Auxiliary-model probe

An unnamed Opus 5 headless probe reported both Opus 5 and a small Haiku token
usage attributable to automatic title generation. Repeating the probe with an
explicit `--name` reported only `claude-opus-5`. The runtime therefore names
every fresh Agent session and omits `--name` on exact-session resume.

This evidence is scoped to Claude Code `2.1.220` and the active account. The
runtime does not assume future entitlement: an account rejection is surfaced
without retrying under another model.

## Regression proof

- Adapter tests pin both full IDs, reject Fable and the old Opus 4.7 ID, and
  require `--name` only for fresh sessions.
- Runtime integration tests reject a third model before the fake Claude process
  is invoked and verify exact Opus 5 plus fresh/resumed naming behavior.
- `npm run check` passes lint, TypeScript checks, 84 runtime tests, and 9
  runtime-integration tests.
- The plugin validator, changed-skill validator, active-change strict validator,
  and all-OpenSpec strict validator pass.
