import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { createClaudeRuntime } from "../../runtime/index.mjs";

const root = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const releaseMetadata = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const escapedReleaseVersion = releaseMetadata.version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const pluginVersionPattern = new RegExp(`^${escapedReleaseVersion}\\+codex\\.[A-Za-z0-9._-]+$`);

describe("native plugin contract", () => {
  const canonicalSkills = [
    "followup-task",
    "interrupt-agent",
    "list-agents",
    "read-agent-messages",
    "send-message",
    "spawn-agent",
    "wait-agent",
  ];

  const canonicalOperations = [
    "followup_task",
    "interrupt_agent",
    "list_agents",
    "read_agent_messages",
    "send_message",
    "spawn_agent",
    "wait_agent",
  ];

  it("publishes only the seven canonical Agent skills and no Codex hook", () => {
    const pluginRoot = path.join(root, "plugins", "cc-for-pein");
    const manifest = JSON.parse(fs.readFileSync(path.join(pluginRoot, ".codex-plugin/plugin.json"), "utf8"));
    assert.equal(manifest.name, "cc-for-pein");
    assert.match(manifest.version, pluginVersionPattern);
    assert.equal(manifest.hooks, undefined);
    assert.equal(manifest.mcpServers, "./.mcp.json");
    assert.equal(manifest.author.name, "Pein");
    const skills = fs.readdirSync(path.join(pluginRoot, "skills"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(pluginRoot, "skills", entry.name, "SKILL.md")))
      .map((entry) => entry.name)
      .sort();
    assert.deepEqual(skills, canonicalSkills);
    for (const legacy of ["cancel", "interrupt", "result", "run", "status", "steer"]) {
      assert.equal(fs.existsSync(path.join(pluginRoot, "skills", legacy)), false);
    }
  });

  it("has no active import or metadata dependency on upstream installers or versioned cache", () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    assert.equal(packageJson.private, true);
    assert.equal(packageJson.scripts["install:codex"], undefined);
    const runtimeText = fs.readdirSync(path.join(root, "runtime"))
      .filter((name) => name.endsWith(".mjs"))
      .map((name) => fs.readFileSync(path.join(root, "runtime", name), "utf8"))
      .join("\n");
    assert.doesNotMatch(runtimeText, /\.\.\/scripts|plugins\/cache|sendbird\/cc-plugin-codex|installer-cli/);
    for (const legacySurface of [
      "scripts/install.sh",
      "scripts/uninstall.sh",
      "scripts/installer-cli.mjs",
      "hooks/hooks.json",
      "internal-skills/cli-runtime/runtime.md",
      "tests/installer-cli.test.mjs",
    ]) {
      assert.equal(fs.existsSync(path.join(root, legacySurface)), false, `${legacySurface} must stay retired`);
    }
  });

  it("exposes only the seven canonical Agent lifecycle operations from the public index", () => {
    const runtime = createClaudeRuntime({
      cwd: root,
      env: {
        ...process.env,
        CODEX_THREAD_ID: "plugin-contract-root",
        CC_TRUSTED_OWNER_ROOT_ID: "plugin-contract-root",
        CC_RUNTIME_HOME: path.join(root, ".test-runtime-contract"),
        CC_RUNTIME_ENV_FILE: path.join(root, "config", "runtime.env"),
      },
    });
    assert.deepEqual(Object.keys(runtime).sort(), canonicalOperations);
    assert.equal(Object.isFrozen(runtime), true);
  });

  it("routes every active skill through exactly one typed MCP tool without shell fallback", () => {
    for (const [name, operation] of [
      ["spawn-agent", "spawn_agent"],
      ["send-message", "send_message"],
      ["followup-task", "followup_task"],
      ["wait-agent", "wait_agent"],
      ["interrupt-agent", "interrupt_agent"],
      ["list-agents", "list_agents"],
      ["read-agent-messages", "read_agent_messages"],
    ]) {
      const text = fs.readFileSync(path.join(root, "plugins", "cc-for-pein", "skills", name, "SKILL.md"), "utf8");
      assert.match(text, new RegExp(`mcp__cc_for_pein__${operation}`));
      assert.match(text, /Trusted Codex\s+metadata owns cwd\/root/i);
      assert.match(
        text,
        /If\s+(?:the tool is\s+)?unavailable,\s+report\s+Plugin\s+startup or\s+discovery failure/i,
      );
      assert.match(text, /never use[\s\S]*shell/i);
      assert.doesNotMatch(text, /cc-runtime\.mjs|runtime\/cli\.mjs|node --/);

      const metadata = fs.readFileSync(
        path.join(root, "plugins", "cc-for-pein", "skills", name, "agents", "openai.yaml"),
        "utf8",
      );
      assert.match(metadata, new RegExp(`mcp__cc_for_pein__${operation}`));
      assert.match(metadata, /never fall back to (?:a )?shell(?: command)?/i);
    }
  });

  it("publishes one checkout-owned stdio MCP server with the one-hour timeout margin", () => {
    const pluginRoot = path.join(root, "plugins", "cc-for-pein");
    const config = JSON.parse(fs.readFileSync(path.join(pluginRoot, ".mcp.json"), "utf8"));
    assert.deepEqual(Object.keys(config.mcpServers), ["cc_for_pein"]);
    assert.deepEqual(config.mcpServers.cc_for_pein, {
      type: "stdio",
      command: "node",
      args: ["--", "/data/CoordExp/cc-plugin-codex/plugins/cc-for-pein/bootstrap/cc-mcp.mjs"],
      cwd: "/data/CoordExp/cc-plugin-codex",
      required: true,
      supports_parallel_tool_calls: true,
      startup_timeout_sec: 30,
      tool_timeout_sec: 3660,
      default_tools_approval_mode: "approve",
    });

    const bootstrap = fs.readFileSync(path.join(pluginRoot, "bootstrap", "cc-mcp.mjs"), "utf8");
    assert.match(bootstrap, /FIXED_RUNTIME_CHECKOUT = "\/data\/CoordExp\/cc-plugin-codex"/);
    assert.match(bootstrap, /runtime["',\s]+"mcp-server\.mjs"/);
    assert.match(bootstrap, /stdio: "inherit"/);
    assert.doesNotMatch(bootstrap, /plugins\/cache|sendbird\/cc-plugin-codex/);
    assert.match(bootstrap, /assertCheckoutDependencies\(checkout\)/);

    const lifecycleBootstrap = fs.readFileSync(path.join(pluginRoot, "bootstrap", "cc-runtime.mjs"), "utf8");
    assert.match(lifecycleBootstrap, /assertCheckoutDependencies\(checkout\)/);

    const server = fs.readFileSync(path.join(root, "runtime", "mcp-server.mjs"), "utf8");
    assert.match(server, /CODEX_SANDBOX_META_KEY = "codex\/sandbox-state-meta"/);
    assert.match(server, /missing _meta\.threadId/);
    assert.match(server, /sandboxCwd/);
    assert.doesNotMatch(server, /background terminal|exec_command|write_stdin/);
    assert.match(server, /invokeIsolatedRuntimeOperation/);
    assert.match(server, /mcp-call-worker\.mjs/);
  });

  it("pins the installed bootstrap and Claude envelope to the canonical checkout", () => {
    const bootstrap = fs.readFileSync(
      path.join(root, "plugins", "cc-for-pein", "bootstrap", "cc-runtime.mjs"),
      "utf8",
    );
    assert.match(bootstrap, /FIXED_RUNTIME_CHECKOUT = "\/data\/CoordExp\/cc-plugin-codex"/);
    assert.doesNotMatch(bootstrap, /function (?:findAncestorEnv|selectEnvFile|bootstrapContext)/);
    assert.match(bootstrap, /CC_RUNTIME_CHECKOUT: checkout/);
    assert.match(bootstrap, /CC_RUNTIME_ENV_FILE: envFile/);
    assert.match(bootstrap, /CC_RUNTIME_SOURCE_ROOT: checkout/);

    const env = fs.readFileSync(path.join(root, "config", "runtime.env"), "utf8");
    assert.match(env, /^CLAUDE_NATIVE_CONFIG_DIR=\/data\/CoordExp\/\.claude$/m);
    assert.match(env, /^CLAUDE_CONFIG_DIR=\/data\/CoordExp\/\.claude$/m);
    assert.match(env, /^CLAUDE_CODE_DISABLE_AUTO_MEMORY=0$/m);
    assert.doesNotMatch(env, /autoMemoryDirectory/);
    assert.match(env, /^CONDA_EXE=\/root\/miniconda3\/bin\/conda$/m);
    for (const key of ["http_proxy", "https_proxy", "all_proxy", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY"]) {
      assert.match(env, new RegExp(`^${key}=http:\\/\\/127\\.0\\.0\\.1:9090$`, "m"));
    }
  });

  it("keeps every lifecycle skill eligible for model-visible discovery", () => {
    for (const name of canonicalSkills) {
      const metadata = fs.readFileSync(
        path.join(root, "plugins", "cc-for-pein", "skills", name, "agents", "openai.yaml"),
        "utf8",
      );
      assert.doesNotMatch(metadata, /allow_implicit_invocation:\s*false/);
    }
  });

  it("keeps spawn success concise and routes internal evidence to operator diagnostics", () => {
    const text = fs.readFileSync(
      path.join(root, "plugins", "cc-for-pein", "skills", "spawn-agent", "SKILL.md"),
      "utf8",
    );
    assert.match(text, /one sentence[\s\S]*`model`[\s\S]*`agent_name`[\s\S]*`status`/i);
    assert.match(text, /no final Claude text[\s\S]*JSON[\s\S]*internal IDs/i);
    assert.match(text, /operator diagnostics[\s\S]*deeper evidence/i);
    assert.match(text, /actionable failure\/recovery detail/i);
    assert.doesNotMatch(text, /receipt exactly as returned/i);
  });

  it("documents exact admitted model and effort identifiers without invented fallback", () => {
    const text = fs.readFileSync(
      path.join(root, "plugins", "cc-for-pein", "skills", "spawn-agent", "SKILL.md"),
      "utf8",
    );
    for (const model of ["claude-haiku-4-5", "claude-sonnet-5", "claude-opus-5", "claude-fable-5"]) {
      assert.match(text, new RegExp(model));
    }
    assert.match(text, /Haiku[\s\S]*cheapest\/fastest[\s\S]*tests[\s\S]*smoke[\s\S]*mechanical work/i);
    assert.match(text, /Haiku\/low[\s\S]*preferred[\s\S]*real smoke[\s\S]*not test-only/i);
    assert.match(text, /Sonnet[\s\S]*balanced general coding/i);
    assert.match(text, /Opus[\s\S]*deep[\s\S]*complex[\s\S]*high-risk/i);
    assert.match(text, /Fable[\s\S]*highest capability\/spend[\s\S]*core decisions[\s\S]*planning[\s\S]*not[\s\S]*routine coding/i);
    assert.match(text, /Approximate guidance, not exact pricing[\s\S]*Haiku < Sonnet < Opus < Fable/i);
    assert.match(text, /Ask when no model family was selected/i);
    assert.match(text, /low.*medium.*high.*xhigh.*max/s);
    assert.match(text, /Agent label such as Ops5[\s\S]*partial IDs[\s\S]*substitute another model/i);
    assert.match(text, /subscription[\s\S]*usage[\s\S]*allowance[\s\S]*credit[\s\S]*quota exhaustion[\s\S]*stop further real Claude tests/i);
    assert.match(text, /generic transient 429[\s\S]*bounded reconnect/i);
    assert.match(text, /`write: false`[\s\S]*prompt-enforced read\/review-only[\s\S]*`write: true`[\s\S]*task-scoped mutation/i);
    assert.match(text, /`IS_SANDBOX=1`[\s\S]*`--dangerously-skip-permissions`[\s\S]*never omit `write`/i);
    assert.match(text, /`leaf`[\s\S]*native `Agent`[\s\S]*`Workflow`[\s\S]*`claude_orchestrator`[\s\S]*exact Fable/i);
    assert.match(text, /Fable must join every child[\s\S]*`Workflow` remains[\s\S]*disabled/i);
    assert.doesNotMatch(text, /allowed_tools/);
    assert.doesNotMatch(text, /fork_turns|execution_profile/);
  });

  it("documents follow-up write inheritance and explicit authority changes", () => {
    const text = fs.readFileSync(
      path.join(root, "plugins", "cc-for-pein", "skills", "followup-task", "SKILL.md"),
      "utf8",
    );
    assert.match(text, /Omitted `write` inherits[\s\S]*latest behavioral authority/i);
    assert.match(text, /Pass `false`[\s\S]*and `true`/i);
    assert.match(text, /full-access terminal parity[\s\S]*prompt-enforced/i);
    assert.match(text, /`agent_name`[\s\S]*`delivery`[\s\S]*raw JSON/i);
  });

  it("keeps send-message receipts and presentation compact", () => {
    const skillRoot = path.join(root, "plugins", "cc-for-pein", "skills", "send-message");
    const text = fs.readFileSync(path.join(skillRoot, "SKILL.md"), "utf8");
    assert.match(text, /one concise sentence[\s\S]*`agent_name`[\s\S]*`delivery`/i);
    assert.match(text, /Do not repeat the message or JSON/i);
    assert.match(text, /queued_no_turn[\s\S]*followup-task/i);
    assert.doesNotMatch(text, /Present the delivery receipt exactly as returned/);

    const metadata = fs.readFileSync(path.join(skillRoot, "agents", "openai.yaml"), "utf8");
    assert.match(metadata, /one concise disposition-aware sentence/i);
    assert.match(metadata, /never raw JSON or repeated message text/i);
  });

  it("keeps list and wait guidance intentional by default", () => {
    for (const name of ["list-agents", "wait-agent"]) {
      const text = fs.readFileSync(
        path.join(root, "plugins", "cc-for-pein", "skills", name, "SKILL.md"),
        "utf8",
      );
      assert.doesNotMatch(text, /Present the runtime receipt exactly as returned/);
      assert.match(text, /Experimental/i);
      if (name === "list-agents") {
        assert.match(text, /final output/i);
        assert.match(text, /[Nn]ever call this\s+solely to recheck completion after a quiet `wait_agent` timeout/i);
        assert.match(text, /call `wait_agent` again directly/i);

        const metadata = fs.readFileSync(
          path.join(root, "plugins", "cc-for-pein", "skills", name, "agents", "openai.yaml"),
          "utf8",
        );
        assert.match(metadata, /solely to recheck completion after a quiet wait_agent timeout/i);
      } else {
        assert.match(text, /complete stored[\s\S]*completion_message/i);
        assert.match(text, /critical path[\s\S]*ordinary join[\s\S]*omit progress/i);
        assert.match(text, /3600000 ms/);
        assert.doesNotMatch(text, /10-minute/i);
        assert.doesNotMatch(text, /timeout_ms/);
        assert.match(text, /wake_on_progress: true[\s\S]*one intermediate update per active\s+Agent job/i);
        assert.match(text, /hook[\s\S]*private/i);
        assert.match(text, /never repeat progress waiting/i);
        assert.match(text, /Do not narrate unchanged timeouts/i);
        assert.match(text, /`list_agents` or\s+`read_agent_messages` immediately\s+afterward merely to recheck completion/i);
        assert.match(text, /call `wait_agent` again directly/i);

        const metadata = fs.readFileSync(
          path.join(root, "plugins", "cc-for-pein", "skills", name, "agents", "openai.yaml"),
          "utf8",
        );
        assert.match(metadata, /critical-path[\s\S]*one-hour completion-first/i);
        assert.match(metadata, /wake_on_progress[\s\S]*one intentional intermediate observation per Agent turn[\s\S]*never repeat/i);
        assert.match(metadata, /quiet timeout[\s\S]*call wait_agent again directly/i);
      }
    }
  });

  it("keeps the seven self-contained Skill instructions within the context budget", () => {
    let words = 0;
    for (const name of canonicalSkills) {
      const text = fs.readFileSync(
        path.join(root, "plugins", "cc-for-pein", "skills", name, "SKILL.md"),
        "utf8",
      );
      words += text.trim().split(/\s+/u).length;
      assert.match(text, /Experimental/i);
      assert.match(text, /If\s+(?:the tool is\s+)?unavailable,\s+report\s+Plugin/i);
    }
    assert.ok(words <= 1_800, `Agent Skill guidance uses ${words} words`);
  });

  it("marks all seven skill prompts and discovery descriptions Experimental", () => {
    for (const name of canonicalSkills) {
      const skillRoot = path.join(root, "plugins", "cc-for-pein", "skills", name);
      assert.match(fs.readFileSync(path.join(skillRoot, "SKILL.md"), "utf8"), /Experimental/i);
      const metadata = fs.readFileSync(path.join(skillRoot, "agents", "openai.yaml"), "utf8");
      assert.match(metadata, /Experimental/i);
      assert.match(metadata, /cannot reactivate an idle Codex parent/i);
    }
  });

  it("keeps package-owned base metadata synchronized with one local plugin cachebuster", () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    const lockfile = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
    const manifest = JSON.parse(
      fs.readFileSync(path.join(root, "plugins", "cc-for-pein", ".codex-plugin", "plugin.json"), "utf8"),
    );
    const marketplace = JSON.parse(fs.readFileSync(path.join(root, ".agents", "plugins", "marketplace.json"), "utf8"));
    assert.equal(packageJson.version, releaseMetadata.version);
    assert.equal(lockfile.version, packageJson.version);
    assert.equal(lockfile.packages[""].version, packageJson.version);
    assert.equal(manifest.version.split("+")[0], packageJson.version);
    assert.match(manifest.version, pluginVersionPattern);
    assert.doesNotMatch(marketplace.plugins.find((plugin) => plugin.name === "cc-for-pein").description, /v0\.4\.0/);
  });
});
