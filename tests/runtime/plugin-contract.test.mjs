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
      assert.match(text, /Trusted Codex metadata[\s\S]*workspace\s+and\s+root\s+identity/i);
      assert.match(text, /never add cwd[\s\S]*environment[\s\S]*(?:owner-root|root identity|owner root)/i);
      assert.match(text, /Plugin\s+discovery\/startup failure[\s\S]*instead of silently[\s\S]*shell fallback/i);
      assert.doesNotMatch(text, /cc-runtime\.mjs|runtime\/cli\.mjs|node --/);

      const metadata = fs.readFileSync(
        path.join(root, "plugins", "cc-for-pein", "skills", name, "agents", "openai.yaml"),
        "utf8",
      );
      assert.match(metadata, new RegExp(`mcp__cc_for_pein__${operation}`));
      assert.match(metadata, /never fall back to a shell command/i);
    }
  });

  it("publishes one checkout-owned stdio MCP server with the one-hour timeout margin", () => {
    const pluginRoot = path.join(root, "plugins", "cc-for-pein");
    const config = JSON.parse(fs.readFileSync(path.join(pluginRoot, ".mcp.json"), "utf8"));
    assert.deepEqual(Object.keys(config.mcpServers), ["cc_for_pein"]);
    assert.deepEqual(config.mcpServers.cc_for_pein, {
      type: "stdio",
      command: "node",
      args: ["--", "bootstrap/cc-mcp.mjs"],
      cwd: ".",
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
    assert.match(text, /stable ID\/path[\s\S]*selected[\s\S]*model[\s\S]*delegation mode[\s\S]*status/i);
    assert.match(text, /Session, job,[\s\S]*continuation,[\s\S]*workspace,[\s\S]*mailbox[\s\S]*operator\/debug/i);
    assert.match(text, /one concise sentence[\s\S]*selected model[\s\S]*role\/tier[\s\S]*Agent path[\s\S]*current status/i);
    assert.match(text, /Do not[\s\S]*include final[\s\S]*Claude text[\s\S]*raw JSON/i);
    assert.match(text, /deeper diagnostics[\s\S]*operator diagnostics path/i);
    assert.match(text, /failure[\s\S]*actionable details/i);
    assert.doesNotMatch(text, /Present the runtime receipt exactly as returned/);
  });

  it("documents exact Claude model and effort identifiers without invented fallback", () => {
    const text = fs.readFileSync(
      path.join(root, "plugins", "cc-for-pein", "skills", "spawn-agent", "SKILL.md"),
      "utf8",
    );
    assert.match(text, /Haiku 4\.5[\s\S]*model: "claude-haiku-4-5"/);
    assert.match(text, /Sonnet 5[\s\S]*model: "claude-sonnet-5"/);
    assert.match(text, /Opus 5[\s\S]*model: "claude-opus-5"/);
    assert.match(text, /Fable 5[\s\S]*model: "claude-fable-5"/);
    assert.match(text, /supports exactly four[\s\S]*full Claude model IDs/i);
    assert.match(text, /Haiku[\s\S]*cheapest and fastest[\s\S]*tests[\s\S]*real smoke[\s\S]*small mechanical work/i);
    assert.match(text, /Haiku\/low[\s\S]*recommended real-smoke[\s\S]*route[\s\S]*not test-only/i);
    assert.match(text, /Sonnet[\s\S]*balanced default[\s\S]*general coding/i);
    assert.match(text, /Opus[\s\S]*deep analysis[\s\S]*complex work[\s\S]*high-risk/i);
    assert.match(text, /Fable[\s\S]*highest[\s\S]*capability and spend[\s\S]*core decision discussion[\s\S]*planning[\s\S]*not routine code writing/i);
    assert.match(text, /Relative Plugin guidance, not exact pricing[\s\S]*Haiku < Sonnet < Opus < Fable/i);
    assert.match(text, /Before invoking[\s\S]*selected model[\s\S]*role\/tier/i);
    assert.match(text, /model is always explicit/i);
    assert.match(text, /does not select one of the four model[\s\S]*stop and ask/i);
    assert.match(text, /must reject a launch without[\s\S]*`model` field/i);
    assert.doesNotMatch(text, /runtime's explicit default is/);
    assert.match(text, /Every model accepts exactly `low`,[\s\S]*`medium`, `high`, `xhigh`, or `max`/);
    assert.match(text, /low.*medium.*high.*xhigh.*max/s);
    assert.match(text, /Never pass a partial model ID[\s\S]*`haiku-4-5`[\s\S]*`sonnet-5`[\s\S]*`opus-5`[\s\S]*`fable-5`/);
    assert.match(text, /Ops5.*Agent\/task name[\s\S]*not an implicit model/s);
    assert.match(text, /never silently retry with (?:a )?different[\s\S]*model/i);
    assert.match(text, /subscription[\s\S]*usage[\s\S]*weekly\/monthly[\s\S]*credits[\s\S]*quota[\s\S]*stop all subsequent[\s\S]*real Claude/i);
    assert.match(text, /generic[\s\S]*HTTP 429[\s\S]*bounded reconnect/i);
    assert.match(text, /--max-budget-usd[\s\S]*not subscription exhaustion/i);
    assert.match(text, /Pass `write: false`[\s\S]*omits `--dangerously-skip-permissions`/i);
    assert.match(text, /Pass `write: true`[\s\S]*adds[\s\S]*`--dangerously-skip-permissions`/i);
    assert.match(text, /Never omit `write` from a model-facing spawn/i);
    assert.match(text, /delegation_mode: "leaf"[\s\S]*claude_orchestrator[\s\S]*claude-fable-5/i);
    assert.match(text, /disables Claude Code's native `Agent` tool/i);
    assert.doesNotMatch(text, /fork_turns|execution_profile/);
    assert.doesNotMatch(text, /`running` spawn acknowledgement/i);
  });

  it("documents follow-up write inheritance and explicit authority changes", () => {
    const text = fs.readFileSync(
      path.join(root, "plugins", "cc-for-pein", "skills", "followup-task", "SKILL.md"),
      "utf8",
    );
    assert.match(text, /Omitted `write` inherits[\s\S]*latest activation intent/i);
    assert.match(text, /`write: false`[\s\S]*`write: true`/i);
    assert.match(text, /not an OS-enforced read-only sandbox/i);
  });

  it("keeps list and wait guidance intentional by default", () => {
    for (const name of ["list-agents", "wait-agent"]) {
      const text = fs.readFileSync(
        path.join(root, "plugins", "cc-for-pein", "skills", name, "SKILL.md"),
        "utf8",
      );
      assert.doesNotMatch(text, /Present the runtime receipt exactly as returned/);
      assert.match(text, /Experimental/i);
      if (name === "list-agents") assert.match(text, /final Claude output/i);
      else {
        assert.match(text, /complete stored[\s\S]*completion_message/i);
        assert.match(text, /ordinary required join[\s\S]*omit `timeout_ms`/i);
        assert.match(text, /600000 ms/);
        assert.match(text, /3600000 ms/);
        assert.match(text, /5 to 10, 20, and[\s\S]*30 seconds/);

        const metadata = fs.readFileSync(
          path.join(root, "plugins", "cc-for-pein", "skills", name, "agents", "openai.yaml"),
          "utf8",
        );
        assert.match(metadata, /ordinary wait[\s\S]*omit timeout_ms[\s\S]*10-minute runtime default/i);
      }
    }
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
