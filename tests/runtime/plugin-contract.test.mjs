import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { createClaudeRuntime } from "../../runtime/index.mjs";

const root = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));

describe("native plugin contract", () => {
  it("publishes only the six lifecycle skills and no Codex hook", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, "plugin/.codex-plugin/plugin.json"), "utf8"));
    assert.equal(manifest.name, "cc");
    assert.equal(manifest.hooks, undefined);
    assert.equal(manifest.author.name, "CoordExp");
    const skills = fs.readdirSync(path.join(root, "plugin", "skills"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(root, "plugin", "skills", entry.name, "SKILL.md")))
      .map((entry) => entry.name)
      .sort();
    assert.deepEqual(skills, ["cancel", "interrupt", "rescue", "result", "status", "steer"]);
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
  });

  it("exposes only the seven stable lifecycle actions from the public index", () => {
    const runtime = createClaudeRuntime({
      cwd: root,
      env: {
        ...process.env,
        CC_RUNTIME_HOME: path.join(root, ".test-runtime-contract"),
        CC_RUNTIME_ENV_FILE: path.join(root, "config", "runtime.env"),
      },
    });
    assert.deepEqual(Object.keys(runtime).sort(), [
      "cancel",
      "followUp",
      "interrupt",
      "result",
      "start",
      "status",
      "steer",
    ]);
    assert.equal(Object.isFrozen(runtime), true);
  });

  it("routes every active skill through the checkout bootstrap", () => {
    for (const name of ["rescue", "steer", "interrupt", "cancel", "status", "result"]) {
      const text = fs.readFileSync(path.join(root, "plugin", "skills", name, "SKILL.md"), "utf8");
      assert.match(text, /bootstrap\/cc-runtime\.mjs/);
      assert.doesNotMatch(text, /<plugin-root>\/runtime\/cli\.mjs/);
    }
  });
});
