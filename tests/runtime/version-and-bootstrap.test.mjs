import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";

import {
  PACKAGE_VERSION,
  pluginBaseVersion,
  pluginVersionForCachebuster,
  readPackageMetadata,
} from "../../runtime/version.mjs";
import {
  REQUIRED_CHECKOUT_DEPENDENCIES,
  assertCheckoutDependencies,
} from "../../plugins/cc-for-pein/bootstrap/dependency-preflight.mjs";

describe("package-owned version metadata", () => {
  it("derives plugin expressions from the package base", () => {
    assert.equal(PACKAGE_VERSION, readPackageMetadata().version);
    assert.equal(
      pluginVersionForCachebuster("test-123", { name: "runtime", version: "1.2.3" }),
      "1.2.3+codex.test-123",
    );
    assert.equal(pluginBaseVersion("1.2.3+codex.test-123"), "1.2.3");
  });

  it("validates package metadata without accepting a build suffix as the base", () => {
    assert.deepEqual(
      readPackageMetadata({
        packageFile: "/virtual/package.json",
        readFileSync: () => JSON.stringify({ name: "runtime", version: "1.2.3" }),
      }),
      { name: "runtime", version: "1.2.3" },
    );
    assert.throws(
      () => readPackageMetadata({
        packageFile: "/virtual/package.json",
        readFileSync: () => JSON.stringify({ name: "runtime", version: "1.2.3+manual" }),
      }),
      /invalid base version/i,
    );
  });
});

describe("installed bootstrap dependency preflight", () => {
  it("checks exactly the production MCP dependencies", () => {
    const resolved = [];
    const receipt = assertCheckoutDependencies("/data/CoordExp/cc-plugin-codex", {
      resolve(specifier) {
        resolved.push(specifier);
        return `/resolved/${specifier}`;
      },
    });
    assert.deepEqual(resolved, REQUIRED_CHECKOUT_DEPENDENCIES);
    assert.equal(receipt.checkout, path.resolve("/data/CoordExp/cc-plugin-codex"));
  });

  it("returns one bounded npm install recovery instead of a loader stack", () => {
    assert.throws(
      () => assertCheckoutDependencies("/data/CoordExp/cc-plugin-codex", {
        resolve(specifier) {
          if (specifier === "zod") throw new Error("ERR_MODULE_NOT_FOUND with private stack");
          return "/resolved/sdk";
        },
      }),
      (error) => {
        assert.match(error.message, /Checkout dependencies are missing/i);
        assert.match(error.message, /Run npm install in \/data\/CoordExp\/cc-plugin-codex/);
        assert.match(error.message, /zod/);
        assert.doesNotMatch(error.message, /private stack|ERR_MODULE_NOT_FOUND/);
        return true;
      },
    );
  });
});
