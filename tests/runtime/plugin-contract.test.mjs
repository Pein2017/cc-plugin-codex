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
    assert.equal(manifest.version, "0.2.0");
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

  it("keeps package, lockfile, manifest, and local marketplace metadata on v0.2", () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    const lockfile = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
    const marketplace = JSON.parse(fs.readFileSync(path.join(root, ".agents", "plugins", "marketplace.json"), "utf8"));
    assert.equal(packageJson.version, "0.2.0");
    assert.equal(lockfile.version, "0.2.0");
    assert.equal(lockfile.packages[""].version, "0.2.0");
    assert.match(marketplace.plugins.find((plugin) => plugin.name === "cc-for-pein").description, /v0\.2\.0/);
  });
});
