## 1. Presentation Contract

- [x] 1.1 Replace the spawn skill's default raw-receipt instruction with a
  concise path/status acknowledgement and explicit raw/debug opt-in.
- [x] 1.2 Add a plugin-contract regression test for concise default output,
  retained raw/debug access, and actionable failures.
- [x] 1.3 Document exact Claude model/effort identifiers in the spawn skill and
  test that orchestration labels cannot become invented model names or silent
  fallbacks.
- [x] 1.4 Replace stale runtime model aliases with a strict Sonnet 5/Opus 5
  whitelist, pass `--name` for new Agent sessions, and cover both behaviors with
  adapter/integration tests.

## 2. Release and Verification

- [x] 2.1 Update release documentation and synchronized plugin version/cache
  metadata without changing the runtime API.
- [x] 2.2 Validate the skill, plugin, OpenSpec change, and complete `npm run
  check` suite.
- [x] 2.3 Reinstall the local plugin and verify the installed snapshot contains
  the new presentation instruction.
