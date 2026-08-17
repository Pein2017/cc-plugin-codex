/**
 * SPDX-License-Identifier: Apache-2.0
 *
 * Task 10.1: the live-evaluation controller, driven entirely by fakes.
 *
 * `plugin-release-readiness` requires this suite by name: every control branch
 * of the acceptance loop is verified with no Server, no session, and no model
 * request. The controller under test is the only thing in the repository that
 * would ever spend live model usage, so it is also the one thing whose refusals
 * matter most -- each is tested as a refusal, not as an absence.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import {
  EVALUATION_EXAMPLES,
  EVALUATION_ROUTE,
  EVALUATION_STOP_CONDITIONS,
  LIVE_AUTHORIZATION_FLAG,
  establishArtifactRoot,
  evaluationAnnouncement,
  parseEvaluationArgv,
  runOpencodeExplorerEvaluation,
  unauthorizedEvaluationReceipt,
} from "../../scripts/evaluate-opencode-explorer.mjs";
import { OPENCODE_EXPLORER_MODEL, OPENCODE_HARNESS_ID } from "../../runtime/opencode-explorer-profile.mjs";
import { closeWorkspaceMutationWitness } from "../../runtime/workspace-mutation-witness.mjs";

const roots = [];
afterEach(() => {
  while (roots.length) fs.rmSync(roots.pop(), { recursive: true, force: true });
});

function scratch(label) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `cc-eval-${label}-`));
  roots.push(root);
  return root;
}

/** A completion the controller should accept. */
function completedUpdate(text = "runtime/harness-registry.mjs") {
  return {
    kind: "completion",
    agent_status: "completed",
    completion_message: text,
    blocking: null,
    metrics: { plugin_observed: { tool_call_count: 2, attempt_count: 1, recovery_attempt_count: 0 } },
  };
}

function spawnReceipt(overrides = {}) {
  return {
    agent_name: "/root/example",
    harness: OPENCODE_HARNESS_ID,
    model: OPENCODE_EXPLORER_MODEL,
    authority: "behavioral_read_only",
    route_maturity: "experimental",
    ...overrides,
  };
}

/**
 * One fake runtime. `updates` supplies one completion per example in order; a
 * function entry is called so a test can throw or vary per call.
 */
function fakeRuntime({ updates = [], receipts = [], followUp } = {}) {
  const calls = [];
  let index = -1;
  return {
    calls,
    async spawn_agent(input) {
      index += 1;
      calls.push({ name: "spawn_agent", input });
      const receipt = receipts[index] ?? spawnReceipt({ agent_name: `/root/${input.task_name}` });
      return typeof receipt === "function" ? receipt(input) : receipt;
    },
    async wait_agent(input) {
      calls.push({ name: "wait_agent", input });
      const update = updates[index] ?? completedUpdate();
      return { update: typeof update === "function" ? update() : update };
    },
    async followup_task(input) {
      calls.push({ name: "followup_task", input });
      if (typeof followUp === "function") return followUp(input);
      throw new Error(
        "Agent /root/explorer_continuation cannot continue: blocked " +
        "(reason=continuation_unsupported, scope=agent, retry=new_agent).",
      );
    },
  };
}

/** A witness pair whose verdicts a test controls. */
function fakeWitness(verdicts) {
  let call = -1;
  const cleanVerdict = {
    version: 1,
    clean: true,
    changedPathCount: 0,
    changedBasenames: [],
    gitStatusChanged: false,
    gitWorkspace: false,
    snapshotOverflow: false,
    enforcement: "harness_policy",
    osContainment: false,
  };
  return {
    open: (root) => ({ root }),
    close: () => {
      call += 1;
      return verdicts?.[call] ?? cleanVerdict;
    },
  };
}

function baseOptions(overrides = {}) {
  const workspace = scratch("workspace");
  const artifactRoot = path.join(scratch("artifacts"), "run-1");
  const witness = overrides.witness ?? fakeWitness();
  let tick = 1_000;
  return {
    argv: [LIVE_AUTHORIZATION_FLAG],
    workspace,
    artifactRoot,
    runtime: fakeRuntime(),
    now: () => (tick += 10),
    announce: () => {},
    openWitness: witness.open,
    closeWitness: witness.close,
    observeReadiness: async () => ({ ready: true, facts: { profile: "codex-explorer" } }),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Authorization: the refusal that must precede every other behavior.
// ---------------------------------------------------------------------------

describe("Task 10.1 — live evaluation is refused without the explicit flag", () => {
  it("refuses before observing readiness, opening a witness, or writing an artifact", async () => {
    let observed = 0;
    let witnessed = 0;
    const artifactRoot = path.join(scratch("artifacts"), "never-created");
    const report = await runOpencodeExplorerEvaluation(baseOptions({
      argv: [],
      artifactRoot,
      observeReadiness: async () => { observed += 1; return { ready: true }; },
      openWitness: () => { witnessed += 1; return {}; },
    }));

    assert.deepEqual(report, unauthorizedEvaluationReceipt());
    assert.equal(report.status, "refused");
    assert.equal(report.examplesRun, 0);
    assert.equal(observed, 0, "readiness must not be observed without authorization");
    assert.equal(witnessed, 0, "no witness is opened without authorization");
    assert.equal(fs.existsSync(artifactRoot), false, "no artifact root is created");
  });

  it("is not enabled by any environment variable", () => {
    // The flag is parsed from argv and nowhere else. This is the whole contract:
    // an inherited environment can never authorize live model usage.
    const source = fs.readFileSync(
      new URL("../../scripts/evaluate-opencode-explorer.mjs", import.meta.url),
      "utf8",
    );
    assert.equal(source.includes("process.env"), false);
    assert.equal(parseEvaluationArgv([]).liveAuthorized, false);
    assert.equal(parseEvaluationArgv([LIVE_AUTHORIZATION_FLAG]).liveAuthorized, true);
  });

  it("refuses a mistyped or unknown argument instead of reading it as an omission", () => {
    for (const argv of [["--live"], ["--authorize-live"], [`${LIVE_AUTHORIZATION_FLAG}=1`]]) {
      assert.throws(() => parseEvaluationArgv(argv), /Unsupported argument/);
    }
    assert.throws(() => parseEvaluationArgv(["--workspace"]), /requires a path/);
  });
});

// ---------------------------------------------------------------------------
// Ordering: preflight, artifact root, and announcement all precede any request.
// ---------------------------------------------------------------------------

describe("Task 10.1 — nothing is requested before the preflight, root, and announcement", () => {
  it("announces the exact route, workspace, and artifact root before the first spawn", async () => {
    const order = [];
    const options = baseOptions({
      observeReadiness: async () => { order.push("readiness"); return { ready: true }; },
      announce: (announcement) => { order.push(announcement); },
    });
    const runtime = fakeRuntime();
    const spawn = runtime.spawn_agent.bind(runtime);
    runtime.spawn_agent = async (input) => { order.push("spawn"); return spawn(input); };
    options.runtime = runtime;

    const report = await runOpencodeExplorerEvaluation(options);
    assert.equal(report.status, "completed");

    assert.equal(order[0], "readiness");
    const announcement = order[1];
    assert.equal(announcement.kind, "live_evaluation_announcement");
    assert.equal(order[2], "spawn", "the announcement precedes the first model request");

    assert.equal(announcement.harness, OPENCODE_HARNESS_ID);
    assert.equal(announcement.model, OPENCODE_EXPLORER_MODEL);
    assert.equal(announcement.authority, "behavioral_read_only");
    assert.equal(announcement.workspace, options.workspace);
    assert.equal(announcement.artifactRoot, path.resolve(options.artifactRoot));
    assert.equal(announcement.capacity, 1);
    assert.deepEqual(announcement.agentNames, EVALUATION_EXAMPLES.map((e) => `/root/${e.taskName}`));
  });

  it("establishes the artifact root before any request and refuses to overwrite one", () => {
    const root = path.join(scratch("artifacts"), "run");
    const established = establishArtifactRoot(root);
    assert.equal(fs.existsSync(established.root), true);
    fs.writeFileSync(established.reportPath, "{}");
    assert.throws(() => establishArtifactRoot(root), /already holds an evaluation report/);
    assert.throws(() => establishArtifactRoot(""), /explicit artifact root/);
  });

  it("stops on a preflight that is not ready, without starting or repairing anything", async () => {
    const options = baseOptions({
      observeReadiness: async () => ({
        ready: false,
        detail: "The Explorer profile policy has drifted.",
        facts: { readiness: "blocked" },
      }),
    });
    const report = await runOpencodeExplorerEvaluation(options);
    assert.equal(report.status, "stopped");
    assert.equal(report.stop.condition, "preflight_not_ready");
    assert.equal(report.examplesRun, 0);
    assert.equal(options.runtime.calls.length, 0, "no Agent is spawned after a refused preflight");
  });

  it("stops a dirty workspace before the preflight, read directly from the tree", async () => {
    // The pre-run gate reads the working tree's own status. A witness cannot
    // answer this question, so the check is injected here and proven against
    // real directories in the dedicated suite below.
    const options = baseOptions({
      inspectWorkspace: () => ({
        gitWorkspace: true,
        clean: false,
        unverifiable: false,
        entries: [" M scratch.txt"],
      }),
    });
    let observed = 0;
    options.observeReadiness = async () => { observed += 1; return { ready: true }; };

    const report = await runOpencodeExplorerEvaluation(options);
    assert.equal(report.stop.condition, "workspace_not_clean");
    assert.equal(observed, 0, "a dirty workspace stops before the preflight");
    assert.equal(options.runtime.calls.length, 0);
  });

  it("records a non-git workspace as unverifiable rather than silently clean", async () => {
    const options = baseOptions();
    const report = await runOpencodeExplorerEvaluation(options);
    assert.equal(report.status, "completed");
    assert.equal(report.preRunWorkspace.gitWorkspace, false);
    assert.equal(report.preRunWorkspace.unverifiable, true);
  });
});

// ---------------------------------------------------------------------------
// The three examples, the conditional branch, and the bounded evidence.
// ---------------------------------------------------------------------------

describe("Task 10.1 — three bounded read-only examples and their evidence", () => {
  it("runs exactly the three shapes, one turn at a time, on the fixed route", async () => {
    const options = baseOptions();
    const report = await runOpencodeExplorerEvaluation(options);

    assert.equal(report.status, "completed");
    assert.equal(report.examplesRun, 3);
    assert.deepEqual(report.examples.map((entry) => entry.example), EVALUATION_EXAMPLES.map((e) => e.id));

    const spawns = options.runtime.calls.filter((call) => call.name === "spawn_agent");
    assert.equal(spawns.length, 3, "at most three examples, and no retry");
    for (const spawn of spawns) {
      assert.equal(spawn.input.harness, EVALUATION_ROUTE.harness);
      assert.equal(spawn.input.model, EVALUATION_ROUTE.model);
      assert.equal(spawn.input.topology, "leaf");
      assert.equal(spawn.input.write, false);
    }
    // One turn at a time: every spawn is joined before the next one starts.
    const sequence = options.runtime.calls.map((call) => call.name).filter((name) => name !== "followup_task");
    assert.deepEqual(sequence, ["spawn_agent", "wait_agent", "spawn_agent", "wait_agent", "spawn_agent", "wait_agent"]);
  });

  it("records the fresh-only substitute branch as the specified path, not a fallback", async () => {
    const report = await runOpencodeExplorerEvaluation(baseOptions());
    const continuation = report.examples.find((entry) => entry.example === "continuation");
    assert.equal(continuation.continuation.branch, "fresh_only_substitute");
    assert.equal(continuation.continuation.refusalReason, "continuation_unsupported");
    assert.equal(report.automaticFallback, "none");
  });

  it("takes the exact follow-up branch when the route proves it", async () => {
    const options = baseOptions({
      runtime: fakeRuntime({ followUp: async () => ({ agent_name: "/root/explorer_continuation", delivery: "new_turn" }) }),
    });
    const report = await runOpencodeExplorerEvaluation(options);
    const continuation = report.examples.find((entry) => entry.example === "continuation");
    assert.equal(continuation.continuation.branch, "exact_follow_up");
    assert.equal(continuation.continuation.refusalReason, null);
  });

  it("captures only bounded evidence, and never a prompt, transcript, endpoint, or credential", async () => {
    const options = baseOptions();
    const report = await runOpencodeExplorerEvaluation(options);
    const serialized = JSON.stringify(report);

    for (const example of EVALUATION_EXAMPLES) {
      assert.equal(serialized.includes(example.prompt), false, `${example.id} prompt must not be captured`);
    }
    assert.doesNotMatch(serialized, /https?:\/\/|password|username|authorization/i);
    for (const entry of report.examples) {
      assert.deepEqual(Object.keys(entry).filter((key) => key === "prompt" || key === "transcript"), []);
      assert.equal(typeof entry.latencyMs, "number");
      assert.equal(typeof entry.resultCharacters, "number");
      assert.ok(entry.metrics, "the provider's own reported metrics are captured");
      assert.equal(entry.witness.enforcement, "harness_policy");
      assert.equal(entry.witness.osContainment, false);
    }

    // The report is written to the artifact root established before the run.
    const written = JSON.parse(fs.readFileSync(path.join(path.resolve(options.artifactRoot), "evaluation.json"), "utf8"));
    assert.equal(written.examplesRun, 3);
    assert.equal(written.route.model, OPENCODE_EXPLORER_MODEL);
  });
});

// ---------------------------------------------------------------------------
// Every stop condition ends the run where it is.
// ---------------------------------------------------------------------------

describe("Task 10.1 — a stop condition ends the run and retries nothing", () => {
  it("declares its closed stop vocabulary", () => {
    assert.deepEqual([...EVALUATION_STOP_CONDITIONS].sort(), [
      "ambiguous_result",
      "auth_or_account_or_quota",
      "empty_result",
      "preflight_not_ready",
      "workspace_mutated",
      "workspace_not_clean",
      "wrong_route",
    ]);
  });

  const cases = [
    {
      name: "a mutated workspace",
      condition: "workspace_mutated",
      options: () => {
        // The run-wide witness now opens once and closes last, so the FIRST
        // close is the first example's own window.
        const witness = fakeWitness([
          { clean: false, changedBasenames: ["notes.md"], enforcement: "harness_policy", osContainment: false },
        ]);
        return { witness, openWitness: witness.open, closeWitness: witness.close };
      },
    },
    {
      name: "a turn that ran on another route",
      condition: "wrong_route",
      options: () => ({
        runtime: fakeRuntime({ receipts: [spawnReceipt({ model: "opencode-go/some-other-model" })] }),
      }),
    },
    {
      name: "a turn that did not settle as completed",
      condition: "ambiguous_result",
      options: () => ({
        runtime: fakeRuntime({ updates: [{ ...completedUpdate(), agent_status: "failed" }] }),
      }),
    },
    {
      name: "an empty result",
      condition: "empty_result",
      options: () => ({
        runtime: fakeRuntime({ updates: [{ ...completedUpdate(), completion_message: "   " }] }),
      }),
    },
    {
      name: "authentication evidence",
      condition: "auth_or_account_or_quota",
      options: () => ({
        runtime: fakeRuntime({
          updates: [{
            ...completedUpdate(),
            agent_status: "failed",
            blocking: { reason: "auth_required", scope: "harness", retry: "operator_required" },
          }],
        }),
      }),
    },
    {
      name: "account or quota evidence",
      condition: "auth_or_account_or_quota",
      options: () => ({
        runtime: fakeRuntime({
          updates: [{
            ...completedUpdate(),
            agent_status: "failed",
            blocking: { reason: "account_limit", scope: "harness", retry: "operator_required" },
          }],
        }),
      }),
    },
  ];

  for (const testCase of cases) {
    it(`stops on ${testCase.name} without running the remaining examples`, async () => {
      const options = baseOptions(testCase.options());
      const report = await runOpencodeExplorerEvaluation(options);

      assert.equal(report.status, "stopped");
      assert.equal(report.stop.condition, testCase.condition);
      assert.equal(report.examplesRun, 0, "the failing example contributes no success evidence");
      assert.equal(
        options.runtime.calls.filter((call) => call.name === "spawn_agent").length,
        1,
        "the run stops at the first example and starts no other",
      );
      // The report is still written: a stopped run is evidence too.
      assert.equal(fs.existsSync(path.join(path.resolve(options.artifactRoot), "evaluation.json")), true);
    });
  }
});

// ---------------------------------------------------------------------------
// The two witnesses that must not be vacuous (11.2 disposition, P2-2).
//
// A witness compares a "before" snapshot to an "after" one. Opening a witness
// and immediately closing it compares a snapshot to itself, which is clean by
// construction no matter what state the workspace was already in. That made the
// pre-run cleanliness gate unable to fire and made the run-wide verdict a
// statement about nothing. Both are proven here against real directories.
// ---------------------------------------------------------------------------

import { spawnSync } from "node:child_process";

function gitWorkspace(label) {
  const root = scratch(label);
  const run = (...args) => spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  run("init", "-q");
  run("config", "user.email", "evaluation@test.invalid");
  run("config", "user.name", "evaluation test");
  fs.writeFileSync(path.join(root, "tracked.txt"), "base\n");
  run("add", "-A");
  run("commit", "-qm", "base");
  return { root, run };
}

describe("Task 10.1 — the pre-run cleanliness gate is not a self-comparison", () => {
  it("stops a modified tracked file before readiness is observed", async () => {
    const { root } = gitWorkspace("dirty-modified");
    fs.appendFileSync(path.join(root, "tracked.txt"), "uncommitted change\n");

    let observed = 0;
    const options = baseOptions({
      workspace: root,
      observeReadiness: async () => { observed += 1; return { ready: true }; },
    });
    // The real witness module, not a fake: this is the mechanism under test.
    delete options.openWitness;
    delete options.closeWitness;

    const report = await runOpencodeExplorerEvaluation(options);
    assert.equal(report.status, "stopped");
    assert.equal(report.stop.condition, "workspace_not_clean");
    assert.equal(observed, 0, "a dirty workspace stops before the preflight");
    assert.equal(options.runtime.calls.length, 0, "and before any model request");
  });

  it("stops an untracked file too", async () => {
    const { root } = gitWorkspace("dirty-untracked");
    fs.writeFileSync(path.join(root, "scratch.md"), "left over from something else\n");

    const options = baseOptions({ workspace: root });
    delete options.openWitness;
    delete options.closeWitness;

    const report = await runOpencodeExplorerEvaluation(options);
    assert.equal(report.stop.condition, "workspace_not_clean");
    assert.equal(options.runtime.calls.length, 0);
  });

  it("runs on a clean tree", async () => {
    const { root } = gitWorkspace("clean");
    const options = baseOptions({ workspace: root });
    delete options.openWitness;
    delete options.closeWitness;

    const report = await runOpencodeExplorerEvaluation(options);
    assert.equal(report.status, "completed");
    assert.equal(report.examplesRun, 3);
    assert.equal(report.workspaceWitness.clean, true);
  });
});

describe("Task 10.1 — the run-wide witness spans the whole run", () => {
  it("catches a mutation that happens between examples, outside every per-example window", async () => {
    const { root } = gitWorkspace("between-examples");
    const options = baseOptions({ workspace: root });
    delete options.openWitness;

    // Mutate once in the gap BETWEEN examples: after the first example's own
    // witness has closed and before the second one opens. The loop runs no
    // seam there, so the write is staged from the close itself -- which is
    // precisely the moment no per-example window covers.
    let closes = 0;
    options.closeWitness = (witness) => {
      const verdict = closeWorkspaceMutationWitness(witness);
      closes += 1;
      if (closes === 1) fs.writeFileSync(path.join(root, "between.txt"), "written between examples\n");
      return verdict;
    };

    const report = await runOpencodeExplorerEvaluation(options);

    // Every example's own window stayed clean, so the run completes...
    assert.equal(report.status, "completed");
    assert.equal(report.examplesRun, 3);
    for (const entry of report.examples) {
      assert.equal(entry.witness.clean, true);
    }
    // ...and the run-wide verdict is the one that reports the truth.
    assert.equal(report.workspaceWitness.clean, false);
    assert.equal(report.workspaceWitness.changedBasenames.includes("between.txt"), true);
    assert.equal(report.workspaceWitness.enforcement, "harness_policy");
    assert.equal(report.workspaceWitness.osContainment, false);
  });
});
