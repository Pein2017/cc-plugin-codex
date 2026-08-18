import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import {
  acquirePromotionGate,
  promotionGatePaths,
  withRuntimeLoadGate,
} from "../../runtime/promotion-gate.mjs";

const temporaryDirectories = [];
afterEach(() => {
  while (temporaryDirectories.length > 0) {
    fs.rmSync(temporaryDirectories.pop(), { recursive: true, force: true });
  }
});

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cc-promotion-gate-"));
  temporaryDirectories.push(root);
  const gateDirectory = path.join(root, "gate");
  const markerPath = path.join(gateDirectory, "loaders", `${process.pid}-test.json`);
  return { root, gateDirectory, markerPath };
}

async function waitUntil(predicate, timeoutMs = 1_000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for test condition.");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe("runtime promotion gate", () => {
  it("waits for an active runtime import before granting promotion", async () => {
    const { gateDirectory, markerPath } = fixture();
    let releaseLoad;
    const load = withRuntimeLoadGate({
      gateDirectory,
      markerPath,
      load: () => new Promise((resolve) => { releaseLoad = resolve; }),
    });
    await waitUntil(() => fs.existsSync(markerPath));
    let acquired = false;
    const promotion = acquirePromotionGate({ gateDirectory }).then((gate) => {
      acquired = true;
      return gate;
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(acquired, false);
    releaseLoad("loaded");
    assert.equal(await load, "loaded");
    const gate = await promotion;
    assert.equal(acquired, true);
    gate.release();
  });

  it("holds a new runtime import until promotion releases exclusivity", async () => {
    const { gateDirectory, markerPath } = fixture();
    const promotion = await acquirePromotionGate({ gateDirectory });
    let imported = false;
    const load = withRuntimeLoadGate({
      gateDirectory,
      markerPath,
      load: () => { imported = true; return "new-runtime"; },
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(imported, false);
    promotion.release();
    assert.equal(await load, "new-runtime");
    assert.equal(imported, true);
  });

  it("removes only a marker whose owner is provably absent", async () => {
    const { gateDirectory } = fixture();
    const paths = promotionGatePaths(gateDirectory);
    fs.mkdirSync(paths.loaders, { recursive: true });
    const stale = path.join(paths.loaders, "stale.json");
    fs.writeFileSync(stale, JSON.stringify({ pid: 2_147_483_647 }));
    const promotion = await acquirePromotionGate({ gateDirectory });
    assert.equal(fs.existsSync(stale), false);
    promotion.release();
  });

  it("fails closed and preserves a live loader marker", async () => {
    const { gateDirectory } = fixture();
    const paths = promotionGatePaths(gateDirectory);
    fs.mkdirSync(paths.loaders, { recursive: true });
    const live = path.join(paths.loaders, "live.json");
    fs.writeFileSync(live, JSON.stringify({ pid: process.pid }));
    await assert.rejects(
      acquirePromotionGate({ gateDirectory, timeoutMs: 30, pollMs: 5 }),
      (error) => error?.code === "HARNESSDOCK_PROMOTION_LOADERS_ACTIVE",
    );
    assert.equal(fs.existsSync(live), true);
  });
});
