import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import {
  isLocallyCurrentOAuthCredential,
  observeClaudeCredentialState,
  sameCredentialGeneration,
} from "../../runtime/claude-credential-state.mjs";
import { getClaudeAuthStatus } from "../../runtime/claude-headless-adapter.mjs";

const roots = [];

afterEach(() => {
  while (roots.length > 0) fs.rmSync(roots.pop(), { recursive: true, force: true });
});

function fixture(label) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `cc-credential-${label}-`));
  roots.push(root);
  const configDir = path.join(root, ".claude");
  fs.mkdirSync(configDir);
  return { root, configDir, credentialFile: path.join(configDir, ".credentials.json") };
}

function writeOAuth(file, overrides = {}) {
  fs.writeFileSync(file, `${JSON.stringify({
    claudeAiOauth: {
      accessToken: "secret-access-sentinel",
      refreshToken: "secret-refresh-sentinel",
      expiresAt: Date.parse("2026-08-11T20:00:00.000Z"),
      refreshTokenExpiresAt: Date.parse("2026-09-11T20:00:00.000Z"),
      subscriptionType: "max",
      email: "private@example.invalid",
      orgId: "private-org-sentinel",
      scopes: ["private-scope-sentinel"],
      ...overrides,
    },
  })}\n`, { mode: 0o600 });
}

describe("Claude credential observation", () => {
  it("projects a current native OAuth credential without any secret or identity material", () => {
    const { configDir, credentialFile } = fixture("current");
    writeOAuth(credentialFile);

    const observed = observeClaudeCredentialState({
      env: { CLAUDE_CONFIG_DIR: configDir },
      nowMs: Date.parse("2026-08-11T12:00:00.000Z"),
    });

    assert.deepEqual(Object.keys(observed).sort(), [
      "accessExpiresAt", "accessLocallyExpired", "configIdentity", "generation",
      "liveValidated", "refreshExpiresAt", "refreshLocallyExpired", "source", "state", "version",
    ]);
    assert.equal(observed.version, 1);
    assert.equal(observed.source, "native_oauth");
    assert.equal(observed.state, "present");
    assert.equal(observed.liveValidated, false);
    assert.equal(observed.configIdentity, fs.realpathSync.native(configDir));
    assert.equal(observed.accessExpiresAt, "2026-08-11T20:00:00.000Z");
    assert.equal(observed.accessLocallyExpired, false);
    assert.equal(observed.refreshExpiresAt, "2026-09-11T20:00:00.000Z");
    assert.equal(observed.refreshLocallyExpired, false);
    assert.deepEqual(Object.keys(observed.generation).sort(), ["ctimeNs", "dev", "ino", "mtimeNs", "size"]);
    for (const value of Object.values(observed.generation)) assert.match(value, /^\d+$/);
    assert.equal(isLocallyCurrentOAuthCredential(observed, Date.parse("2026-08-11T12:00:00.000Z")), true);

    const serialized = JSON.stringify(observed);
    for (const sentinel of [
      "secret-access-sentinel", "secret-refresh-sentinel", "private@example.invalid",
      "private-org-sentinel", "private-scope-sentinel",
    ]) {
      assert.doesNotMatch(serialized, new RegExp(sentinel));
    }
    assert.doesNotMatch(serialized, /accessToken|refreshToken|email|orgId|scopes/);
  });

  it("reports local expiry without claiming live validation", () => {
    const { configDir, credentialFile } = fixture("expired");
    writeOAuth(credentialFile, {
      expiresAt: Date.parse("2026-08-11T11:59:59.000Z"),
      refreshTokenExpiresAt: Date.parse("2026-08-12T12:00:00.000Z"),
    });

    const observed = observeClaudeCredentialState({
      env: { CLAUDE_CONFIG_DIR: configDir },
      nowMs: Date.parse("2026-08-11T12:00:00.000Z"),
    });
    assert.equal(observed.state, "present");
    assert.equal(observed.accessLocallyExpired, true);
    assert.equal(observed.refreshLocallyExpired, false);
    assert.equal(observed.liveValidated, false);
    assert.equal(isLocallyCurrentOAuthCredential(observed, Date.parse("2026-08-11T12:00:00.000Z")), false);
  });

  it("fails closed for missing and malformed native credential records", () => {
    const missing = fixture("missing");
    const missingState = observeClaudeCredentialState({
      env: { CLAUDE_CONFIG_DIR: missing.configDir },
      nowMs: 1,
    });
    assert.equal(missingState.state, "missing");
    assert.equal(missingState.generation, null);

    const malformed = fixture("malformed");
    fs.writeFileSync(malformed.credentialFile, "not-json\n", { mode: 0o600 });
    const malformedState = observeClaudeCredentialState({
      env: { CLAUDE_CONFIG_DIR: malformed.configDir },
      nowMs: 1,
    });
    assert.equal(malformedState.state, "unavailable");
    assert.notEqual(malformedState.generation, null);
    assert.equal(malformedState.accessExpiresAt, null);
    assert.equal(isLocallyCurrentOAuthCredential(malformedState, 1), false);
  });

  it("reports API-key presence without deriving a key generation", () => {
    const { configDir } = fixture("api-key");
    const observed = observeClaudeCredentialState({
      env: { CLAUDE_CONFIG_DIR: configDir, ANTHROPIC_API_KEY: "api-key-secret-sentinel" },
      nowMs: 1,
    });
    assert.equal(observed.source, "api_key");
    assert.equal(observed.state, "present");
    assert.equal(observed.generation, null);
    assert.equal(observed.liveValidated, false);
    assert.doesNotMatch(JSON.stringify(observed), /api-key-secret-sentinel/);
  });

  it("binds metadata-only auth status to the same redacted credential observation", () => {
    const { configDir, credentialFile } = fixture("auth-status");
    writeOAuth(credentialFile);
    const status = getClaudeAuthStatus(configDir, {
      env: { CLAUDE_CONFIG_DIR: configDir },
      claudeBin: "/fake/claude",
      nowMs: Date.parse("2026-08-11T12:00:00.000Z"),
      spawnSyncImpl: (_command, args) => {
        assert.deepEqual(args, ["auth", "status"]);
        return { status: 0, stdout: "authenticated\n", stderr: "" };
      },
    });

    assert.equal(status.loggedIn, true);
    assert.equal(status.liveValidated, false);
    assert.equal(status.detail, "credential present (provider not live-validated)");
    assert.equal(status.credential.state, "present");
    assert.equal(status.credential.accessLocallyExpired, false);
    assert.doesNotMatch(JSON.stringify(status), /secret-|private@|private-org|private-scope/);
  });

  it("distinguishes an atomically replaced credential generation", () => {
    const { configDir, credentialFile } = fixture("generation");
    writeOAuth(credentialFile);
    const before = observeClaudeCredentialState({ env: { CLAUDE_CONFIG_DIR: configDir }, nowMs: 1 });

    const replacement = path.join(configDir, ".credentials.next");
    writeOAuth(replacement, { expiresAt: Date.parse("2026-08-12T20:00:00.000Z") });
    fs.renameSync(replacement, credentialFile);
    const after = observeClaudeCredentialState({ env: { CLAUDE_CONFIG_DIR: configDir }, nowMs: 1 });

    assert.equal(sameCredentialGeneration(before, before), true);
    assert.equal(sameCredentialGeneration(before, after), false);
    assert.equal(sameCredentialGeneration(before, { ...after, configIdentity: "/foreign" }), false);
    assert.equal(sameCredentialGeneration(before, null), false);
  });
});
