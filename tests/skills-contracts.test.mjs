/**
 * Copyright 2026 Sendbird, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.resolve(
  fileURLToPath(new URL("../", import.meta.url))
);

function read(relativePath) {
  return fs.readFileSync(path.join(PROJECT_ROOT, relativePath), "utf8");
}

test("review forwarding commands preserve the workspace for reserved job ids", () => {
  const skills = [
    ["review", "skills/review/SKILL.md"],
    ["adversarial review", "skills/adversarial-review/SKILL.md"],
  ];

  for (const [name, skillPath] of skills) {
    const skill = read(skillPath);
    assert.match(
      skill,
      /Whenever forwarding that reserved `--job-id`, also pass `--cwd <workspace-root>` using `workspaceRoot` from the same helper response/i,
      `${name} must keep reserved job ids in their workspace`,
    );
  }
});

test("internal runtime references keep the active-root and notification invariants", () => {
  const reviewRuntime = read("internal-skills/review-runtime/runtime.md");
  const rescueRuntime = read("internal-skills/cli-runtime/runtime.md");
  const activeRootPattern = /<plugin-root>\/scripts\/claude-companion\.mjs/i;

  assert.match(reviewRuntime, /resolved the active plugin root/i);
  assert.match(reviewRuntime, activeRootPattern);
  assert.match(reviewRuntime, /Do not derive a new runtime path from this document or the current working tree/i);
  assert.match(reviewRuntime, /Never emit an empty routing placeholder such as `--owner-session-id {2}--job-id`/i);
  assert.match(reviewRuntime, /blocking foreground shell-tool call, not as a background terminal\/session/i);
  assert.match(reviewRuntime, /Do not request a shell session id, poll a shell session later, or return before the companion command exits/i);
  assert.match(reviewRuntime, /if the available shell tool is `exec_command`, call it once in non-interactive mode and wait for command exit in that same call/i);
  assert.match(reviewRuntime, /mention the tool name `send_input` literally/i);
  assert.match(reviewRuntime, /exact tool shape `send_input\(\{ target: <parent-thread-id>, message: <steering-message> \}\)`/i);
  assert.match(reviewRuntime, /do not silently drop the completion notification path when the parent provided a non-empty parent thread id/i);
  assert.match(reviewRuntime, /Use that same steering message as the child's own final assistant message for background mode/i);

  assert.match(rescueRuntime, /launches the tracked companion directly from the current Codex thread/i);
  assert.match(rescueRuntime, activeRootPattern);
  assert.match(rescueRuntime, /Use `task --background` for durable asynchronous work/i);
  assert.match(rescueRuntime, /Do not spawn a disposable forwarding subagent/i);
  assert.match(rescueRuntime, /background-routing-context --kind task --json/i);
  assert.match(rescueRuntime, /control the job with `status`, `steer`, `interrupt`, `cancel`, and `result`/i);
});

test("review skills keep background execution outside the companion command", () => {
  const review = read("skills/review/SKILL.md");
  const adversarial = read("skills/adversarial-review/SKILL.md");
  const activeRootPattern = /<plugin-root>\/scripts\/claude-companion\.mjs/i;

  assert.match(review, /Resolve `<plugin-root>` as two directories above this `SKILL\.md` file/i);
  assert.match(review, /Use `\$cc:review` as the default when the user asks for code review, asks you to have Claude review something, or wants a second review pass without explicitly asking for stronger adversarial scrutiny/i);
  assert.match(review, /If the user asks for stronger challenge on design, tradeoffs, rollout risk, migration risk, configuration behavior, or provides custom review focus text, route to `\$cc:adversarial-review` instead/i);
  assert.match(review, /If the user wants Claude Code to investigate, validate by changing code, or actually fix\/implement something, route to `\$cc:rescue` instead/i);
  assert.match(review, /If the overall request is "you review it too, also ask Claude to review in the background, then you aggregate and fix it", keep the delegated Claude part on `\$cc:review` unless the user explicitly asks for a harsher or more adversarial review/i);
  assert.match(review, /`\$cc:review` does not accept custom focus text/i);
  assert.match(review, activeRootPattern);
  assert.match(review, /Treat `--wait` and `--background` as Codex-side execution controls only/i);
  assert.match(review, /Strip them before calling the companion command/i);
  assert.match(review, /The companion review process itself always runs in the foreground/i);
  assert.match(review, /internal runtime reference at `\.\.\/\.\.\/internal-skills\/review-runtime\/runtime\.md`/i);
  assert.match(review, /It is an internal reference document, not a public skill to invoke/i);
  assert.match(review, /review --view-state on-success/i);
  assert.match(review, /Foreground review belongs to the main Codex thread/i);
  assert.match(review, /Do not spawn a review subagent/i);
  assert.match(review, /do not invoke a generic review-runner role/i);
  assert.match(review, /Do not fall back to raw `claude`, `claude-code`, `claude review`, `bash -lc \.\.\.claude\.\.\.`/i);
  assert.match(review, /If the .*companion command fails, surface that failure/i);
  assert.match(review, /For background review, use Codex's built-in `default` subagent/i);
  assert.match(review, /Do not satisfy background review by using a generic `claude_review_runner`-style helper role/i);
  assert.match(review, /Never satisfy background review by running the companion command itself with shell backgrounding/i);
  assert.match(review, /Background here means "spawn the forwarding child via `spawn_agent` and do not wait in the parent turn\."/i);
  assert.match(review, /background-routing-context --kind review --json/i);
  assert.match(review, /internal `--job-id <reserved-job-id>` routing flag/i);
  assert.match(review, /non-empty `ownerSessionId`/i);
  assert.match(review, /omit `--owner-session-id` entirely/i);
  assert.match(review, /spawn_agent/i);
  assert.match(review, /`fork_context: false`/i);
  assert.match(review, /`model: "gpt-5\.4-mini"`/i);
  assert.match(review, /`reasoning_effort: "medium"`/i);
  assert.match(review, /Prefer a self-contained child message over inheriting parent history/i);
  assert.match(review, /Only consider `fork_context: true` as a last resort/i);
  assert.match(review, /retry once with `model: "gpt-5\.4"`/i);
  assert.match(review, /review --view-state defer/i);
  assert.match(review, /include `--owner-session-id <owner-session-id>` only when the parent resolved a non-empty owner session id/i);
  assert.match(review, /never leave an empty routing placeholder such as `--owner-session-id {2}--job-id`/i);
  assert.match(review, /blocking foreground shell-tool call, not as a background terminal\/session/i);
  assert.match(review, /Do not request a shell session id, poll a shell session later, or return before the companion command exits/i);
  assert.match(review, /if the available shell tool is `exec_command`, call it once in non-interactive mode and wait for command exit in that same call/i);
  assert.match(review, /allow one extra `send_input` call after a successful shell result/i);
  assert.match(review, /must mention the tool name `send_input` literally/i);
  assert.match(review, /must target the provided parent thread id/i);
  assert.match(review, /exact tool shape `send_input\(\{ target: <parent-thread-id>, message: <steering-message> \}\)`/i);
  assert.match(review, /do not silently drop the completion notification path from the child prompt/i);
  assert.match(review, /Background Claude Code review finished\. Open it with \$cc:result <reserved-job-id>\./i);
  assert.match(review, /that `send_input` message should use one of those exact steering messages/i);
  assert.match(review, /use these steering messages instead of embedding the raw review result in the notification/i);
  assert.match(review, /do not embed the raw Claude result inside the notification message/i);
  assert.match(review, /do not include any other prose in that notification message/i);
  assert.match(review, /use that same steering message as the child's own final assistant message instead of echoing the raw review result/i);
  assert.match(review, /Check the subagent session or \$cc:status for progress, and once it's done, we will let you know to see the results\./i);
  assert.doesNotMatch(review, /claude-companion\.mjs" review --background/i);
  assert.doesNotMatch(review, /claude-companion\.mjs" review \$ARGUMENTS/i);

  assert.match(adversarial, /Resolve `<plugin-root>` as two directories above this `SKILL\.md` file/i);
  assert.match(adversarial, /Do not treat `\$cc:adversarial-review` as the default review path/i);
  assert.match(adversarial, /Good triggers include requests to challenge the design, challenge tradeoffs, pressure-test a risky change, question whether a migration\/config\/template change really removed the risk, or honor custom focus text that asks for harsher review/i);
  assert.match(adversarial, /If the user wants Claude Code to go beyond review and perform investigation, validation edits, or implementation work, route to `\$cc:rescue` instead/i);
  assert.match(adversarial, /If the user asks for a local review plus a separate Claude background review and then wants the main Codex thread to aggregate the findings and apply fixes, keep the delegated Claude portion on `\$cc:review` unless the user explicitly asks for the adversarial angle/i);
  assert.match(adversarial, /Unlike `\$cc:review`, this skill accepts custom focus text after the flags/i);
  assert.match(adversarial, activeRootPattern);
  assert.match(adversarial, /Treat `--wait` and `--background` as Codex-side execution controls only/i);
  assert.match(adversarial, /Strip them before calling the companion command/i);
  assert.match(adversarial, /The companion review process itself always runs in the foreground/i);
  assert.match(adversarial, /internal runtime reference at `\.\.\/\.\.\/internal-skills\/review-runtime\/runtime\.md`/i);
  assert.match(adversarial, /It is an internal reference document, not a public skill to invoke/i);
  assert.match(adversarial, /adversarial-review --view-state on-success/i);
  assert.match(adversarial, /Foreground adversarial review belongs to the main Codex thread/i);
  assert.match(adversarial, /Do not spawn a review subagent/i);
  assert.match(adversarial, /do not invoke a generic review-runner role/i);
  assert.match(adversarial, /Do not fall back to raw `claude`, `claude-code`, `claude review`, `bash -lc \.\.\.claude\.\.\.`/i);
  assert.match(adversarial, /If the .*companion command fails, surface that failure/i);
  assert.match(adversarial, /For background adversarial review, use Codex's built-in `default` subagent/i);
  assert.match(adversarial, /Do not satisfy background adversarial review by using a generic `claude_review_runner`-style helper role/i);
  assert.match(adversarial, /Never satisfy background adversarial review by running the companion command itself with shell backgrounding/i);
  assert.match(adversarial, /Background here means "spawn the forwarding child via `spawn_agent` and do not wait in the parent turn\."/i);
  assert.match(adversarial, /background-routing-context --kind review --json/i);
  assert.match(adversarial, /internal `--job-id <reserved-job-id>` routing flag/i);
  assert.match(adversarial, /non-empty `ownerSessionId`/i);
  assert.match(adversarial, /omit `--owner-session-id` entirely/i);
  assert.match(adversarial, /spawn_agent/i);
  assert.match(adversarial, /`fork_context: false`/i);
  assert.match(adversarial, /`model: "gpt-5\.4-mini"`/i);
  assert.match(adversarial, /`reasoning_effort: "medium"`/i);
  assert.match(adversarial, /Prefer a self-contained child message over inheriting parent history/i);
  assert.match(adversarial, /Only consider `fork_context: true` as a last resort/i);
  assert.match(adversarial, /retry once with `model: "gpt-5\.4"`/i);
  assert.match(adversarial, /adversarial-review --view-state defer/i);
  assert.match(adversarial, /include `--owner-session-id <owner-session-id>` only when the parent resolved a non-empty owner session id/i);
  assert.match(adversarial, /never leave an empty routing placeholder such as `--owner-session-id {2}--job-id`/i);
  assert.match(adversarial, /blocking foreground shell-tool call, not as a background terminal\/session/i);
  assert.match(adversarial, /Do not request a shell session id, poll a shell session later, or return before the companion command exits/i);
  assert.match(adversarial, /if the available shell tool is `exec_command`, call it once in non-interactive mode and wait for command exit in that same call/i);
  assert.match(adversarial, /allow one extra `send_input` call after a successful shell result/i);
  assert.match(adversarial, /must mention the tool name `send_input` literally/i);
  assert.match(adversarial, /must target the provided parent thread id/i);
  assert.match(adversarial, /exact tool shape `send_input\(\{ target: <parent-thread-id>, message: <steering-message> \}\)`/i);
  assert.match(adversarial, /do not silently drop the completion notification path from the child prompt/i);
  assert.match(adversarial, /Background Claude Code adversarial review finished\. Open it with \$cc:result <reserved-job-id>\./i);
  assert.match(adversarial, /that `send_input` message should use one of those exact steering messages/i);
  assert.match(adversarial, /use these steering messages instead of embedding the raw review result in the notification/i);
  assert.match(adversarial, /do not embed the raw Claude result inside the notification message/i);
  assert.match(adversarial, /do not include any other prose in that notification message/i);
  assert.match(adversarial, /use that same steering message as the child's own final assistant message instead of echoing the raw review result/i);
  assert.match(adversarial, /Check the subagent session or \$cc:status for progress, and once it's done, we will let you know to see the results\./i);
  assert.doesNotMatch(adversarial, /claude-companion\.mjs" adversarial-review --background/i);
  assert.doesNotMatch(adversarial, /claude-companion\.mjs" adversarial-review \$ARGUMENTS/i);
});

test("rescue launches Claude directly through the durable companion runtime", () => {
  const rescue = read("skills/rescue/SKILL.md");
  const runtime = read("internal-skills/cli-runtime/runtime.md");

  assert.match(rescue, /Run the companion directly from the user-facing Codex thread/i);
  assert.match(rescue, /Do not create a forwarding subagent/i);
  assert.match(rescue, /For `--background`, call `task --background` directly/i);
  assert.match(rescue, /background-routing-context --kind task --json/i);
  assert.match(rescue, /Use `--view-state defer` for background work and `--view-state on-success` for foreground work/i);
  assert.match(rescue, /task-resume-candidate --json/i);
  assert.match(rescue, /\$cc:steer <job-id> <message>/i);
  assert.doesNotMatch(rescue, /spawn_agent|gpt-5\.4-mini|transient forwarding worker/i);

  assert.match(runtime, /Use `task --background` for durable asynchronous work/i);
  assert.match(runtime, /Do not spawn a disposable forwarding subagent/i);
  assert.match(runtime, /Pair a reserved job id with its returned `--cwd`/i);
});

test("steer and interrupt skills expose distinct live, follow-up, and graceful-stop contracts", () => {
  const steer = read("skills/steer/SKILL.md");
  const interrupt = read("skills/interrupt/SKILL.md");
  const cancel = read("skills/cancel/SKILL.md");

  assert.match(steer, /persists the message before returning/i);
  assert.match(steer, /live stdin stream or next recovery attempt/i);
  assert.match(steer, /completed or interrupted job, require `--follow-up`/i);
  assert.match(interrupt, /never escalates to SIGKILL/i);
  assert.match(interrupt, /\$cc:steer --follow-up/i);
  assert.match(cancel, /Prefer `\$cc:interrupt`/i);
});

test("setup skill repairs native plugin hook feature gates before the final setup report", () => {
  const setup = read("skills/setup/SKILL.md");

  assert.match(setup, /Resolve `<plugin-root>` as two directories above this `SKILL\.md` file/i);
  assert.match(setup, /<plugin-root>\/scripts\/claude-companion\.mjs/i);
  assert.match(setup, /setup --json/i);
  assert.match(setup, /missing native plugin hook features/i);
  assert.match(setup, /hook trust/i);
  assert.match(setup, /\[features\]\.hooks/i);
  assert.match(setup, /\[features\]\.plugin_hooks/i);
  assert.match(setup, /native hook trust hashes/i);
  assert.match(setup, /plugin-data destination .* writable-root list/i);
  assert.match(setup, /restart Codex and rerun the same setup command/i);
  assert.doesNotMatch(setup, /install-hooks\.mjs/i);
});

test("simple runtime skills resolve the active plugin root from the skill path", () => {
  const status = read("skills/status/SKILL.md");
  const result = read("skills/result/SKILL.md");
  const cancel = read("skills/cancel/SKILL.md");
  const steer = read("skills/steer/SKILL.md");
  const interrupt = read("skills/interrupt/SKILL.md");
  const activeRootPattern = /<plugin-root>\/scripts\/claude-companion\.mjs/i;

  for (const skillText of [status, result, cancel, steer, interrupt]) {
    assert.match(skillText, /Resolve `<plugin-root>` as two directories above this `SKILL\.md` file/i);
    assert.match(skillText, activeRootPattern);
    assert.doesNotMatch(skillText, /<installed-plugin-root>/i);
  }
});
