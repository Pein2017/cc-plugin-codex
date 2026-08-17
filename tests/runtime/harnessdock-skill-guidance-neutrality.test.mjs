import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const root = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const skillRoot = path.join(root, "plugins", "codex-harnessdock", "skills");

const skills = [
  "followup-task",
  "interrupt-agent",
  "list-agents",
  "read-agent-messages",
  "send-message",
  "spawn-agent",
  "wait-agent",
];

const readSkill = (name) => fs.readFileSync(path.join(skillRoot, name, "SKILL.md"), "utf8");
const readMetadata = (name) => fs.readFileSync(path.join(skillRoot, name, "agents/openai.yaml"), "utf8");

describe("HarnessDock Skill guidance neutrality", () => {
  it("does not prescribe scheduler policy or a global team shape", () => {
    const forbiddenPolicy = [
      /Parent join policy/i,
      /classify the result as `required`/i,
      /`parallel-then-join`/i,
      /`explicitly-detached`/i,
      /\b(?:fan[- ]out|fanout)\b/i,
      /delegation thresholds?/i,
      /automatic route ranking/i,
      /worker conflict resolution/i,
      /conflict policy/i,
      /cheapest\/fastest/i,
      /preferred for real smoke/i,
      /highest capability\/spend/i,
      /Approximate guidance, not exact pricing/i,
      /\bHaiku < Sonnet < Opus < Fable\b/i,
      /\bleaf by default\b/i,
      /\brequired join\b/i,
      /\bcritical path\b/i,
      /completion-first/i,
    ];

    for (const name of skills) {
      for (const [surface, text] of [["SKILL.md", readSkill(name)], ["agents/openai.yaml", readMetadata(name)]]) {
        for (const pattern of forbiddenPolicy) {
          assert.doesNotMatch(text, pattern, `${name}/${surface} retains scheduler policy: ${pattern}`);
        }
      }
    }
  });

  it("retains common operation routing, ownership, and safety mechanics", () => {
    const operations = {
      "followup-task": "followup_task",
      "interrupt-agent": "interrupt_agent",
      "list-agents": "list_agents",
      "read-agent-messages": "read_agent_messages",
      "send-message": "send_message",
      "spawn-agent": "spawn_agent",
      "wait-agent": "wait_agent",
    };

    for (const [name, operation] of Object.entries(operations)) {
      const text = readSkill(name);
      assert.match(text, new RegExp(`mcp__codex_harnessdock__${operation}`), name);
      assert.match(text, /Trusted Codex\s+metadata owns cwd\/root/i, name);
      assert.match(text, /report\s+Plugin\s+startup or\s+discovery failure/i, name);
      assert.match(text, /never use[\s\S]*shell/i, name);
      assert.match(text, /exact retained Skill path/i, name);
      assert.match(text, /HARNESSDOCK_MCP_RESTART_REQUIRED[\s\S]*new Codex task/i, name);
      assert.match(text, /Never repair Plugin Cache/i, name);
      assert.match(text, /Experimental/i, name);
    }
  });

  it("keeps operation-local targeting, acknowledgement, blocking, and safety facts", () => {
    const followup = readSkill("followup-task");
    assert.match(followup, /exact current-root `target` and\s+`message`/i);
    assert.match(followup, /Omitted `write` inherits[\s\S]*Pass `false`[\s\S]*`true`/i);
    assert.match(followup, /Model and delegation mode are immutable/i);
    assert.match(followup, /`activation_pending`[\s\S]*do not resend/i);
    assert.match(followup, /blocked Agent rejects with a closed `reason`\/`scope`\/`retry`/i);
    assert.match(followup, /auth_required[\s\S]*safe-fresh recover/i);
    assert.match(followup, /one concise sentence from `agent_name` and `delivery`/i);

    const interrupt = readSkill("interrupt-agent");
    assert.match(interrupt, /exact current-root `target`/i);
    assert.match(interrupt, /ends only the current turn[\s\S]*never deletes the[\s\S]*durable Agent/i);
    assert.match(interrupt, /graceful\s+interrupt request may be accepted, rejected, or left pending/i);
    assert.match(interrupt, /`status`[\s\S]*`interrupted`,\s*`still_working`,\s*or\s*`failed`/i);
    assert.match(interrupt, /`still_working`[\s\S]*never\s+a\s+forced\s+termination/i);
    assert.match(interrupt, /Exact-session[\s\S]*continuation is offered only when native evidence proves/i);
    assert.match(interrupt, /non-public legacy record/i);
    assert.doesNotMatch(interrupt, /Forced unflushed\s+termination becomes failed and non-resumable/i);
    assert.doesNotMatch(interrupt, /force-terminat/i);
    assert.match(interrupt, /Native Agent Team lead[\s\S]*fresh team under the durable parent/i);
    assert.match(interrupt, /one concise sentence from\s+`agent_name` and `status`/i);

    const list = readSkill("list-agents");
    assert.match(list, /list_agents` with no fields[\s\S]*optional `path_prefix`/i);
    assert.match(list, /logical state snapshot/i);
    assert.match(list, /starting`, `working`,\s+`completed`, `failed`, or `interrupted`/i);
    assert.match(list, /completion comes from `\$codex-harnessdock:wait-agent`/i);
    assert.match(list, /never call this\s+solely to recheck completion after a quiet `wait_agent` timeout/i);
    assert.match(list, /only its durable parent Card appears here/i);

    const history = readSkill("read-agent-messages");
    assert.match(history, /exact current-root `target`[\s\S]*optional `before`\/`limit`/i);
    assert.match(history, /cannot reactivate Codex/i);
    assert.match(history, /extend Claude retention/i);
    assert.match(history, /latest outer-assistant text, newest first/i);
    assert.match(history, /Thinking, tools, attachments, child transcripts, and Codex history\s+are excluded/i);
    assert.match(history, /Current completion comes directly from[\s\S]*wait-agent/i);
    assert.match(history, /Missing native-team evidence remains unverified/i);

    const send = readSkill("send-message");
    assert.match(send, /exact current-root `target` and\s+`message`/i);
    assert.match(send, /Queueing never activates an idle Claude Agent or Codex/i);
    assert.match(send, /blocked Agent rejects instead of queueing[\s\S]*closed `reason`\/`scope`\/`retry`/i);
    assert.match(send, /`dispatched_active`[\s\S]*`activation_pending`[\s\S]*`queued_no_turn`/i);
    assert.match(send, /`activation_pending` means an activation already owns the message/i);
    assert.match(send, /no Plugin mailbox or cross-session bridge/i);

    const spawn = readSkill("spawn-agent");
    assert.match(spawn, /with `task_name`, self-contained `message`,\s+exact `model`, and explicit `write`/i);
    assert.match(spawn, /optional fields are `description`,\s+`reasoning_effort`, and `delegation_mode`/i);
    assert.match(spawn, /never pass environment, session, or fork selectors/i);
    for (const model of ["claude-haiku-4-5", "claude-sonnet-5", "claude-opus-5", "claude-fable-5"]) {
      assert.match(spawn, new RegExp(model));
    }
    assert.match(spawn, /low`, `medium`, `high`, `xhigh`, `max`/i);
    assert.match(spawn, /`write: false` is behavioral read\/review-only[\s\S]*`write: true`/i);
    assert.match(spawn, /`IS_SANDBOX=1`[\s\S]*`--dangerously-skip-permissions`/i);
    assert.match(spawn, /Use `claude_orchestrator` only with exact Opus or Fable/i);
    assert.match(spawn, /named member must launch asynchronously[\s\S]*correlated `SendMessage`/i);
    assert.match(spawn, /Native `SendMessage` can\s+technically reach other sessions/i);
    assert.match(spawn, /transport never\s+auto-reconnects/i);
    assert.match(spawn, /`Workflow`\s+remains disabled/i);
    assert.match(spawn, /subscription[\s\S]*quota exhaustion[\s\S]*stop further real Claude tests/i);

    const wait = readSkill("wait-agent");
    const waitMetadata = readMetadata("wait-agent");
    assert.match(wait, /optional `wake_on_progress`,\s+`acknowledge_tokens`, or `targets`/i);
    assert.match(wait, /One to\s+eight unique exact current-root targets/i);
    assert.match(wait, /multiple\s+targets form one completion-only all-settled barrier/i);
    assert.match(wait, /wake_on_progress: true[\s\S]*exactly one target/i);
    assert.match(wait, /completion has priority[\s\S]*completion_message[\s\S]*token/i);
    assert.match(wait, /progress returns at most one sanitized update/i);
    assert.match(wait, /timeout means no unread current-root completion was visible/i);
    assert.match(wait, /wait cannot reactivate an ended Codex turn/i);
    assert.match(wait, /Claude-native same-team settle signals/i);
    assert.match(waitMetadata, /mcp__codex_harnessdock__wait_agent/i);
    assert.match(waitMetadata, /one to eight exact targets[\s\S]*all-settled barrier/i);
    assert.match(waitMetadata, /one-hour completion bound/i);
    assert.match(waitMetadata, /wake_on_progress[\s\S]*one intentional intermediate observation/i);
    assert.match(waitMetadata, /quiet timeout[\s\S]*call wait_agent again directly/i);
  });
});
