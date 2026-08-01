## 1. Regression Contract

- [x] 1.1 Add typed MCP tests that reject model-facing `timeout_ms`, inject the fixed 600000 ms runtime bound, and preserve optional progress plus completion acknowledgement.
- [x] 1.2 Add runtime tests proving one progress delivery per active job, hook suppression, completion priority, root isolation, race safety, and a fresh budget for a follow-up job.

## 2. Runtime Implementation

- [x] 2.1 Fix the typed MCP wait boundary to the 600000 ms completion-first observation while retaining explicit timeout support in the checkout CLI/runtime.
- [x] 2.2 Enforce the durable one-progress-per-job budget and prevent hook activity from being publicly claimed or returned.

## 3. Model Guidance

- [x] 3.1 Align the typed tool description and wait Skill with Codex Multi-Agent V2 critical-path joining and no-reflex-polling guidance.

## 4. Verification

- [x] 4.1 Run the focused red-to-green runtime/MCP tests and confirm completion still returns before the fixed upper bound.
- [x] 4.2 Run strict OpenSpec validation, `npm run check`, and `git diff --check` without version bump, release, installation, Cache mutation, real Claude launch, commit, or push.
