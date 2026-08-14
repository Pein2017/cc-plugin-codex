import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const root = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

describe("HarnessDock for Codex identity contract", () => {
  it("publishes one canonical identity and public metadata", () => {
    const packageJson = readJson("package.json");
    const manifest = readJson("plugins/codex-harnessdock/.codex-plugin/plugin.json");
    const marketplace = readJson(".agents/plugins/marketplace.json");

    assert.equal(packageJson.name, "codex-harnessdock-runtime");
    assert.deepEqual(packageJson.bin, {
      "codex-harnessdock-runtime": "plugins/codex-harnessdock/bootstrap/harnessdock-runtime.mjs",
    });
    assert.equal(packageJson.author.name, "Pein2017");
    assert.equal(packageJson.author.url, "https://github.com/Pein2017");
    assert.equal(packageJson.author.email, undefined);
    assert.equal(packageJson.license, "Apache-2.0");
    assert.match(packageJson.description, /unofficial third-party/i);
    assert.match(packageJson.description, /not affiliated with or endorsed by OpenAI/i);

    assert.equal(manifest.name, "codex-harnessdock");
    assert.equal(manifest.author.name, "Pein2017");
    assert.equal(manifest.author.url, "https://github.com/Pein2017");
    assert.equal(manifest.author.email, undefined);
    assert.equal(manifest.license, "Apache-2.0");
    assert.equal(manifest.interface.displayName, "HarnessDock for Codex");
    assert.match(manifest.description, /unofficial third-party/i);
    assert.match(manifest.description, /not affiliated with or endorsed by OpenAI/i);
    assert.equal(manifest.interface.composerIcon, "./assets/harnessdock-icon.svg");
    assert.equal(manifest.interface.logo, "./assets/harnessdock-logo.svg");

    assert.equal(marketplace.plugins.length, 1);
    assert.equal(marketplace.plugins[0].name, "codex-harnessdock");
    assert.equal(marketplace.plugins[0].source.path, "./plugins/codex-harnessdock");
  });

  it("uses the new MCP, data, and runtime-home namespaces", () => {
    const descriptor = readJson("plugins/codex-harnessdock/.mcp.json");
    assert.deepEqual(Object.keys(descriptor.mcpServers), ["codex_harnessdock"]);
    assert.equal(
      descriptor.mcpServers.codex_harnessdock.args[1],
      "/data/CoordExp/cc-plugin-codex/plugins/codex-harnessdock/bootstrap/harnessdock-mcp.mjs",
    );

    const paths = fs.readFileSync(path.join(root, "runtime/paths.mjs"), "utf8");
    assert.match(paths, /PLUGIN_DATA_NAMESPACE = "codex-harnessdock"/);
    assert.match(paths, /CODEX_HARNESSDOCK_RUNTIME_HOME/);
    assert.match(paths, /CC_RUNTIME_HOME is retired/);
  });

  it("rejects old identity from current public/runtime surfaces", () => {
    const files = [
      "package.json",
      "package-lock.json",
      ".agents/plugins/marketplace.json",
      "README.md",
      "NOTICE",
      ...fs.readdirSync(path.join(root, "runtime"))
        .filter((name) => name.endsWith(".mjs"))
        .map((name) => path.join("runtime", name)),
      ...fs.readdirSync(path.join(root, "scripts"))
        .filter((name) => name.endsWith(".mjs"))
        .map((name) => path.join("scripts", name)),
    ];
    for (const relativePath of files) {
      const text = fs.readFileSync(path.join(root, relativePath), "utf8");
      const historicalUsageLedger = relativePath === "runtime/operator-usage-ledger.mjs";
      assert.doesNotMatch(text, /cc-for-pein-runtime|cc-for-pein/);
      if (!historicalUsageLedger) assert.doesNotMatch(text, /cc_for_pein/);
      const retiredOverrideGuard = ["runtime/paths.mjs", "runtime/plugin-identity-cutover.mjs"].includes(relativePath);
      if (!retiredOverrideGuard) {
        assert.doesNotMatch(text, /CC_RUNTIME_HOME|CC_MCP_RESTART_REQUIRED/);
      }
    }
  });
});
