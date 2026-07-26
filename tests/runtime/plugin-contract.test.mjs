import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { createClaudeRuntime } from "../../runtime/index.mjs";

const root = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));

describe("native plugin contract", () => {
  const canonicalSkills = [
    "followup-task",
    "interrupt-agent",
    "list-agents",
    "send-message",
    "spawn-agent",
    "wait-agent",
  ];

  const canonicalOperations = [
    "followup_task",
    "interrupt_agent",
    "list_agents",
    "send_message",
    "spawn_agent",
    "wait_agent",
  ];

  it("publishes only the six canonical Agent skills and no Codex hook", () => {
    const pluginRoot = path.join(root, "plugins", "cc-for-pein");
    const manifest = JSON.parse(fs.readFileSync(path.join(pluginRoot, ".codex-plugin/plugin.json"), "utf8"));
    assert.equal(manifest.name, "cc-for-pein");
    assert.match(manifest.version, /^0\.4\.0\+codex\.[A-Za-z0-9._-]+$/);
    assert.equal(manifest.hooks, undefined);
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

  it("exposes only the six canonical Agent lifecycle operations from the public index", () => {
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

  it("routes every active skill through the checkout bootstrap", () => {
    for (const [name, operation] of [
      ["spawn-agent", "spawn_agent"],
      ["send-message", "send_message"],
      ["followup-task", "followup_task"],
      ["wait-agent", "wait_agent"],
      ["interrupt-agent", "interrupt_agent"],
      ["list-agents", "list_agents"],
    ]) {
      const text = fs.readFileSync(path.join(root, "plugins", "cc-for-pein", "skills", name, "SKILL.md"), "utf8");
      assert.match(text, /bootstrap\/cc-runtime\.mjs/);
      assert.match(text, new RegExp(`cc-runtime\\.mjs" ${operation} \\$ARGUMENTS`));
      assert.doesNotMatch(text, /<plugin-root>\/runtime\/cli\.mjs/);
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

  it("keeps spawn success concise while retaining explicit raw and actionable output", () => {
    const text = fs.readFileSync(
      path.join(root, "plugins", "cc-for-pein", "skills", "spawn-agent", "SKILL.md"),
      "utf8",
    );
    assert.match(text, /do not print its raw JSON by default/i);
    assert.match(text, /one concise sentence[\s\S]*selected model[\s\S]*Agent path[\s\S]*current status/i);
    assert.match(text, /Do not include final[\s\S]*Claude output/i);
    assert.match(text, /explicitly[\s\S]*requests raw or debug output/i);
    assert.match(text, /failure[\s\S]*actionable details/i);
    assert.doesNotMatch(text, /Present the runtime receipt exactly as returned/);
  });

  it("documents exact Claude model and effort identifiers without invented fallback", () => {
    const text = fs.readFileSync(
      path.join(root, "plugins", "cc-for-pein", "skills", "spawn-agent", "SKILL.md"),
      "utf8",
    );
    assert.match(text, /Sonnet.*Sonnet 5[\s\S]*--model claude-sonnet-5/);
    assert.match(text, /Opus.*Opus 5.*Ops5[\s\S]*--model claude-opus-5/);
    assert.match(text, /Haiku[\s\S]*--model claude-haiku-4-5[\s\S]*--reasoning-effort low/i);
    assert.match(text, /Haiku[\s\S]*test-only[\s\S]*smoke[\s\S]*hook[\s\S]*environment-parity[\s\S]*integration/i);
    assert.match(text, /supports exactly three[\s\S]*Claude model selections/i);
    assert.match(text, /Only Sonnet and Opus are for[\s\S]*general work/i);
    assert.match(text, /requires[\s\S]*explicit[\s\S]*--model/i);
    assert.match(text, /For other work[\s\S]*does not select Sonnet or Opus[\s\S]*stop and ask/i);
    assert.match(text, /must reject a launch without `--model`/i);
    assert.doesNotMatch(text, /runtime's explicit default is/);
    assert.doesNotMatch(text, /--model fable/);
    assert.match(text, /low.*medium.*high.*xhigh.*max/s);
    assert.match(text, /Ops5.*Agent\/task name[\s\S]*not an implicit model/s);
    assert.match(text, /Never pass partial[\s\S]*`opus-5`[\s\S]*`sonnet-5`/);
    assert.match(text, /never silently retry with a different[\s\S]*model/i);
    assert.match(text, /subscription[\s\S]*usage[\s\S]*weekly\/monthly[\s\S]*credits[\s\S]*quota[\s\S]*stop all subsequent[\s\S]*real Claude/i);
    assert.match(text, /generic[\s\S]*HTTP 429[\s\S]*bounded reconnect/i);
    assert.match(text, /--max-budget-usd[\s\S]*not subscription exhaustion/i);
  });

  it("keeps list and wait receipts concise by default", () => {
    for (const name of ["list-agents", "wait-agent"]) {
      const text = fs.readFileSync(
        path.join(root, "plugins", "cc-for-pein", "skills", name, "SKILL.md"),
        "utf8",
      );
      assert.doesNotMatch(text, /Present the runtime receipt exactly as returned/);
      assert.match(text, /Experimental/i);
      if (name === "list-agents") assert.match(text, /final Claude output/i);
      else {
        assert.match(text, /completion handoff/i);
        assert.match(text, /600000 ms/);
        assert.match(text, /3600000 ms/);
        assert.match(text, /5 to 10, 20, and[\s\S]*30 seconds/);
      }
    }
  });

  it("marks all six skill prompts and discovery descriptions Experimental", () => {
    for (const name of canonicalSkills) {
      const skillRoot = path.join(root, "plugins", "cc-for-pein", "skills", name);
      assert.match(fs.readFileSync(path.join(skillRoot, "SKILL.md"), "utf8"), /Experimental/i);
      const metadata = fs.readFileSync(path.join(skillRoot, "agents", "openai.yaml"), "utf8");
      assert.match(metadata, /Experimental/i);
      assert.match(metadata, /cannot reactivate an idle Codex parent/i);
    }
  });

  it("keeps v0.4 base metadata synchronized with one local plugin cachebuster", () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    const lockfile = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
    const manifest = JSON.parse(
      fs.readFileSync(path.join(root, "plugins", "cc-for-pein", ".codex-plugin", "plugin.json"), "utf8"),
    );
    const marketplace = JSON.parse(fs.readFileSync(path.join(root, ".agents", "plugins", "marketplace.json"), "utf8"));
    assert.equal(packageJson.version, "0.4.0");
    assert.equal(lockfile.version, "0.4.0");
    assert.equal(lockfile.packages[""].version, "0.4.0");
    assert.equal(manifest.version.split("+")[0], packageJson.version);
    assert.match(manifest.version, /^0\.4\.0\+codex\.[A-Za-z0-9._-]+$/);
    assert.match(marketplace.plugins.find((plugin) => plugin.name === "cc-for-pein").description, /v0\.4\.0/);
  });
});
