import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, afterEach, describe, it } from "node:test";

import { createAgentRuntime } from "../../runtime/agent-runtime.mjs";

const roots = [];
const sharedRuntimeHome = fs.mkdtempSync(path.join(os.tmpdir(), "hd-agent-model-migration-runtime-"));

after(() => fs.rmSync(sharedRuntimeHome, { recursive: true, force: true }));

afterEach(() => {
  while (roots.length) fs.rmSync(roots.pop(), { recursive: true, force: true });
});

function findRegistryFileFor(agentId) {
  const pending = [sharedRuntimeHome];
  while (pending.length > 0) {
    const directory = pending.pop();
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const candidate = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        pending.push(candidate);
        continue;
      }
      if (entry.name !== "registry.json") continue;
      const registry = JSON.parse(fs.readFileSync(candidate, "utf8"));
      if (registry.agents?.[agentId]) return { filePath: candidate, registry };
    }
  }
  throw new Error(`No Agent registry contains ${agentId}.`);
}

/**
 * Rewrite one Agent as a genuine version-1 record. Legacy model backfill only
 * exists for Agents created before Harness state, so the migration contract has
 * to be exercised against real version-1 storage rather than a v2 record.
 */
function downgradeToVersionOne(agentId, patch) {
  const { filePath, registry } = findRegistryFileFor(agentId);
  const stored = registry.agents[agentId];
  const {
    harnessId: _harnessId,
    driverVersion: _driverVersion,
    capabilities: _capabilities,
    selectedEffort: _selectedEffort,
    nativeSessionRef: _nativeSessionRef,
    ...legacy
  } = stored;
  registry.agents[agentId] = { ...legacy, version: 1, ...patch };
  fs.writeFileSync(filePath, JSON.stringify(registry));
}

function setup(model) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hd-agent-model-migration-"));
  roots.push(root);
  const workspace = path.join(root, "workspace");
  const claudeConfigDir = path.join(root, ".claude");
  const sessionId = "11111111-2222-4333-8444-555555555555";
  const artifactDirectory = path.join(claudeConfigDir, "projects", "-legacy-workspace");
  const envFile = path.join(root, "runtime.env");
  fs.mkdirSync(workspace);
  fs.mkdirSync(artifactDirectory, { recursive: true });
  const artifact = path.join(artifactDirectory, `${sessionId}.jsonl`);
  fs.writeFileSync(
    artifact,
    `${JSON.stringify({ type: "assistant", message: { model } })}\n`,
  );
  fs.writeFileSync(envFile, `CLAUDE_CONFIG_DIR=${claudeConfigDir}\n`);
  const runtime = createAgentRuntime({
    cwd: workspace,
    envFile,
    env: {
      CODEX_THREAD_ID: "root-agent-model-migration",
      CODEX_HARNESSDOCK_RUNTIME_HOME: sharedRuntimeHome,
    },
  });
  const agent = runtime.store.createAgent({ task_name: "legacy" });
  downgradeToVersionOne(agent.agentId, {
    status: "completed",
    latestJobId: null,
    selectedModel: null,
    claudeSessionId: sessionId,
    claudeConfigDir,
    continuation: {
      mode: "exact_session",
      evidence: { reason: "legacy_session_without_job_receipt" },
    },
  });
  return { runtime, agent, artifact };
}

describe("legacy Agent model migration", () => {
  it("backfills a supported exact model from Claude session artifacts after job pruning", () => {
    const { runtime, agent } = setup("claude-sonnet-5");
    runtime.reconcile();
    const migrated = runtime.store.readAgent(agent.agentId);
    assert.equal(migrated.selectedModel, "claude-sonnet-5");
    assert.equal(migrated.continuation.mode, "exact_session");
  });

  it("normalizes verified dated Haiku 4.5 artifact evidence to the canonical family", () => {
    const { runtime, agent } = setup("claude-haiku-4-5-20251001");
    runtime.reconcile();
    const migrated = runtime.store.readAgent(agent.agentId);
    assert.equal(migrated.selectedModel, "claude-haiku-4-5");
    assert.equal(migrated.continuation.mode, "exact_session");
  });

  it("reconciles native Fable 5 artifact evidence to its canonical model", () => {
    const { runtime, agent } = setup("claude-fable-5");
    runtime.reconcile();
    const migrated = runtime.store.readAgent(agent.agentId);
    assert.equal(migrated.selectedModel, "claude-fable-5");
    assert.equal(migrated.continuation.mode, "exact_session");
  });

  it("blocks an unsupported historical model instead of substituting Opus 5", async () => {
    const { runtime, agent } = setup("claude-opus-4-7[1m]");
    runtime.reconcile();
    const blocked = runtime.store.readAgent(agent.agentId);
    assert.equal(blocked.selectedModel, null);
    assert.equal(blocked.continuation.mode, "blocked");
    assert.equal(blocked.continuation.evidence.reason, "legacy_agent_model_unsupported");
    assert.equal(blocked.continuation.evidence.observedModel, "claude-opus-4-7");
    // The model-facing rejection names only the closed triple; the durable
    // continuation evidence above (asserted separately) keeps the exact
    // internal migration reason for operator diagnostics.
    assert.throws(
      () => runtime.sendMessage({ target: agent.agentId, message: "must not queue" }),
      /reason=route_unsupported, scope=agent, retry=new_agent/,
    );
    await assert.rejects(
      runtime.followupTask({ target: agent.agentId, message: "must not substitute" }),
      /reason=route_unsupported, scope=agent, retry=new_agent/,
    );
  });

  it("defers an unproven legacy model while its turn is still active", () => {
    const { runtime, agent } = setup(null);
    runtime.store.updateAgent(agent.agentId, (current) => ({
      ...current,
      status: "running",
      activeJobId: "legacy-active-turn",
    }));
    runtime.migrateLegacySelectedModel(runtime.store.readAgent(agent.agentId), [], new Map());
    const deferred = runtime.store.readAgent(agent.agentId);
    assert.equal(deferred.selectedModel, null);
    assert.equal(deferred.continuation.mode, "exact_session");
    assert.equal(deferred.continuation.evidence.reason, "legacy_agent_model_pending");
  });

  it("recovers a terminal unproven Agent when its persisted artifact later proves Sonnet 5", () => {
    const { runtime, agent, artifact } = setup(null);
    runtime.reconcile();
    assert.equal(runtime.store.readAgent(agent.agentId).continuation.evidence.reason, "legacy_agent_model_unproven");

    fs.appendFileSync(artifact, `${JSON.stringify({ type: "assistant", message: { model: "claude-sonnet-5" } })}\n`);
    runtime.reconcile();
    const recovered = runtime.store.readAgent(agent.agentId);
    assert.equal(recovered.selectedModel, "claude-sonnet-5");
    assert.equal(recovered.continuation.mode, "exact_session");
    assert.equal(recovered.continuation.evidence.reason, "legacy_agent_model_migrated");
  });
});
