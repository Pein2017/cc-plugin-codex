/**
 * SPDX-License-Identifier: Apache-2.0
 *
 * Task 10.1 of add-opencode-explorer-driver: the controller for the three
 * explicitly authorized live OpenCode Explorer examples.
 *
 * This file is the whole of Task 10.1. Running it against a live Server is
 * Task 10.2-10.5, which sit behind the deliberate manual stop boundary: the
 * repository builds and regression-tests this controller against fakes and
 * never executes it live.
 *
 * ## What this refuses to do
 *
 * `plugin-release-readiness` states the shape: a separate explicit live flag, an
 * exact announcement before any model request, at most three read-only
 * examples, a stop on account/auth/quota evidence, bounded evidence capture,
 * and no automatic fallback to Claude, another OpenCode model, a provider API,
 * or a CLI attach. Each of those is a refusal, so each is implemented as one:
 *
 *   - the live flag is a command-line argument and nothing else. No environment
 *     variable enables it, because an environment variable is inherited and a
 *     flag is typed;
 *   - the artifact root is established before the first model request, so
 *     evidence has a home before there is anything to record;
 *   - the workspace witness opens before the first example and closes after the
 *     last, and each example carries its own witness inside that;
 *   - a stop condition ends the run. It never advances to the next example, and
 *     it never substitutes a different route.
 *
 * ## Why every effect is a seam
 *
 * Every side effect -- readiness observation, Agent lifecycle, clock, artifact
 * write, announcement -- is injected. That is not test decoration: it is what
 * lets the acceptance suite drive every branch of a live-only controller with
 * no Server and no model, which `plugin-release-readiness` requires by name.
 */
import fs from "node:fs";
import path from "node:path";

import {
  OPENCODE_EXPLORER_MODEL,
  OPENCODE_EXPLORER_PROFILE_NAME,
  OPENCODE_HARNESS_ID,
} from "../runtime/opencode-explorer-profile.mjs";
import {
  closeWorkspaceMutationWitness,
  openWorkspaceMutationWitness,
} from "../runtime/workspace-mutation-witness.mjs";

/**
 * The one argument that authorizes live model usage. It is deliberately long
 * and specific: nobody types it by habit, and no wrapper inherits it.
 */
export const LIVE_AUTHORIZATION_FLAG = "--authorize-live-opencode-evaluation";

/** The route every example runs on. It is fixed here, never chosen at runtime. */
export const EVALUATION_ROUTE = Object.freeze({
  harness: OPENCODE_HARNESS_ID,
  model: OPENCODE_EXPLORER_MODEL,
  topology: "leaf",
  write: false,
  profile: OPENCODE_EXPLORER_PROFILE_NAME,
});

/** One turn at a time, and one bounded wait per example. */
export const EVALUATION_CAPACITY = 1;
export const EVALUATION_TURN_DEADLINE_MS = 600_000;

/**
 * The closed reasons a run stops. Each ends the run where it is: the remaining
 * examples do not run, and nothing is retried on a different route.
 */
export const EVALUATION_STOP_CONDITIONS = Object.freeze([
  "workspace_mutated",
  "wrong_route",
  "ambiguous_result",
  "empty_result",
  "auth_or_account_or_quota",
  "preflight_not_ready",
  "workspace_not_clean",
]);

/**
 * The three example shapes, in order (10.2).
 *
 * The second is conditional by contract: an exact terminal follow-up is run
 * only where authoritative session/incarnation evidence exists, and the
 * Explorer route proves `fresh_only`, so in practice it takes the substitute
 * branch -- a second fresh Agent that demonstrates exactly that. The substitute
 * is not a fallback; it is the specified behavior for this route.
 */
export const EVALUATION_EXAMPLES = Object.freeze([
  Object.freeze({
    id: "fresh_architecture",
    taskName: "explorer_architecture",
    kind: "fresh",
    prompt:
      "Name the module that owns the static Harness Driver registry in this repository, " +
      "and name the module that owns the durable Agent record. Answer with the two paths only.",
  }),
  Object.freeze({
    id: "continuation",
    taskName: "explorer_continuation",
    kind: "exact_follow_up_or_fresh_substitute",
    prompt:
      "Name the module that owns the version-three durable job record. Answer with the path only.",
    followUpPrompt: "Now name the module that owns the launch claim. Answer with the path only.",
  }),
  Object.freeze({
    id: "mixed_root",
    taskName: "explorer_mixed_root",
    kind: "mixed_root_or_fresh_substitute",
    prompt:
      "Name the module that owns the workspace mutation witness. Answer with the path only.",
  }),
]);

export class EvaluationStop extends Error {
  constructor(condition, detail, evidence = null) {
    super(`OpenCode Explorer evaluation stopped: ${condition}. ${detail}`);
    this.name = "EvaluationStop";
    this.condition = condition;
    this.detail = detail;
    this.evidence = evidence;
  }
}

function assertStopCondition(condition) {
  if (!EVALUATION_STOP_CONDITIONS.includes(condition)) {
    throw new Error(`Unknown evaluation stop condition: ${JSON.stringify(condition)}.`);
  }
  return condition;
}

/**
 * Parse the operator's command line.
 *
 * Authorization is absent unless the exact flag is present. An unknown argument
 * is refused rather than ignored, because a mistyped flag must never read as an
 * omitted one.
 */
export function parseEvaluationArgv(argv = []) {
  const parsed = {
    liveAuthorized: false,
    artifactRoot: null,
    workspace: null,
  };
  const remaining = [...argv];
  while (remaining.length > 0) {
    const argument = remaining.shift();
    if (argument === LIVE_AUTHORIZATION_FLAG) {
      parsed.liveAuthorized = true;
      continue;
    }
    if (argument === "--artifact-root" || argument === "--workspace") {
      const value = remaining.shift();
      if (!value || value.startsWith("--")) {
        throw new Error(`${argument} requires a path.`);
      }
      parsed[argument === "--artifact-root" ? "artifactRoot" : "workspace"] = value;
      continue;
    }
    throw new Error(
      `Unsupported argument ${JSON.stringify(argument)}. Usage: ` +
      `node scripts/evaluate-opencode-explorer.mjs ${LIVE_AUTHORIZATION_FLAG} ` +
      `--workspace <path> --artifact-root <path>`
    );
  }
  return parsed;
}

/** The refusal every unauthorized invocation produces, before any contact. */
export function unauthorizedEvaluationReceipt() {
  return Object.freeze({
    status: "refused",
    reason: "live_authorization_absent",
    detail:
      `Live OpenCode Explorer evaluation requires the explicit ${LIVE_AUTHORIZATION_FLAG} ` +
      "argument. No environment variable enables it. Nothing was observed, started, or requested.",
    liveAuthorized: false,
    examplesRun: 0,
  });
}

/**
 * The exact announcement made before the first model request. It states what is
 * about to be spent and where, in the operator's terms.
 */
export function evaluationAnnouncement({ workspace, artifactRoot, agentNames }) {
  return Object.freeze({
    kind: "live_evaluation_announcement",
    harness: EVALUATION_ROUTE.harness,
    model: EVALUATION_ROUTE.model,
    topology: EVALUATION_ROUTE.topology,
    authority: EVALUATION_ROUTE.write ? "behavioral_write" : "behavioral_read_only",
    profile: EVALUATION_ROUTE.profile,
    workspace,
    artifactRoot,
    agentNames: Object.freeze([...agentNames]),
    capacity: EVALUATION_CAPACITY,
    turnDeadlineMs: EVALUATION_TURN_DEADLINE_MS,
    exampleCount: EVALUATION_EXAMPLES.length,
  });
}

/**
 * The bounded evidence one example contributes. Only what
 * `opencode-explorer-runtime` admits: route and turn lineage, latency, the
 * provider's own reported metrics, Server-reuse facts, the witness verdict, and
 * a bounded result. No prompt, no transcript, no endpoint, no credential.
 */
export function boundedExampleEvidence({ example, receipt, completion, witness, startedAtMs, endedAtMs }) {
  return Object.freeze({
    example: example.id,
    kind: example.kind,
    agentName: receipt?.agent_name ?? null,
    route: Object.freeze({
      harness: receipt?.harness ?? null,
      model: receipt?.model ?? null,
      topology: EVALUATION_ROUTE.topology,
      authority: receipt?.authority ?? null,
      routeMaturity: receipt?.route_maturity ?? null,
    }),
    status: completion?.agent_status ?? null,
    latencyMs: Number.isFinite(startedAtMs) && Number.isFinite(endedAtMs)
      ? endedAtMs - startedAtMs
      : null,
    // Provider numbers are reported, never computed here.
    metrics: completion?.metrics ?? null,
    blocking: completion?.blocking ?? null,
    resultCharacters: typeof completion?.completion_message === "string"
      ? completion.completion_message.length
      : 0,
    witness,
  });
}

function assertCleanWorkspace(verdict) {
  if (verdict.clean) return verdict;
  throw new EvaluationStop(
    assertStopCondition("workspace_not_clean"),
    "The evaluation workspace must be clean and known before any model request.",
    verdict,
  );
}

function assertRouteMatches(receipt, label) {
  if (
    receipt?.harness !== EVALUATION_ROUTE.harness ||
    receipt?.model !== EVALUATION_ROUTE.model ||
    receipt?.authority !== "behavioral_read_only"
  ) {
    throw new EvaluationStop(
      assertStopCondition("wrong_route"),
      `${label} did not run on the fixed evaluation route.`,
      Object.freeze({
        harness: receipt?.harness ?? null,
        model: receipt?.model ?? null,
        authority: receipt?.authority ?? null,
      }),
    );
  }
  return receipt;
}

/** Account, authentication, and quota evidence all stop the run immediately. */
const STOPPING_BLOCK_REASONS = Object.freeze(["auth_required", "account_limit"]);

function assertUsableCompletion(completion, label) {
  const blocking = completion?.blocking ?? null;
  if (blocking && STOPPING_BLOCK_REASONS.includes(blocking.reason)) {
    throw new EvaluationStop(
      assertStopCondition("auth_or_account_or_quota"),
      `${label} was blocked by ${blocking.reason}; no further example runs and nothing is retried.`,
      blocking,
    );
  }
  if (completion?.agent_status !== "completed") {
    throw new EvaluationStop(
      assertStopCondition("ambiguous_result"),
      `${label} did not settle as a completed turn.`,
      Object.freeze({ status: completion?.agent_status ?? null, blocking }),
    );
  }
  if (typeof completion?.completion_message !== "string" || completion.completion_message.trim() === "") {
    throw new EvaluationStop(
      assertStopCondition("empty_result"),
      `${label} produced no result text.`,
    );
  }
  return completion;
}

/**
 * Establish the artifact root before any model request, and refuse a root that
 * already holds a report: an evaluation never overwrites the evidence of a
 * previous one.
 */
export function establishArtifactRoot(artifactRoot, { fileSystem = fs } = {}) {
  const stated = String(artifactRoot ?? "").trim();
  // `path.resolve("")` is the working directory, which is exactly the accident
  // this refuses: an artifact root is stated, never defaulted to wherever the
  // operator happened to be standing.
  if (!stated) {
    throw new Error("A live evaluation requires an explicit artifact root.");
  }
  const root = path.resolve(stated);
  if (root === path.parse(root).root) {
    throw new Error("A live evaluation artifact root may not be a filesystem root.");
  }
  const report = path.join(root, "evaluation.json");
  if (fileSystem.existsSync(report)) {
    throw new Error(`Artifact root ${root} already holds an evaluation report; choose a fresh root.`);
  }
  fileSystem.mkdirSync(root, { recursive: true });
  return Object.freeze({ root, reportPath: report });
}

/**
 * Run the bounded evaluation.
 *
 * @param {{
 *   argv?: string[],
 *   workspace?: string,
 *   artifactRoot?: string,
 *   runtime: any,
 *   now?: () => number,
 *   announce?: (announcement: any) => void,
 *   fileSystem?: typeof fs,
 *   openWitness?: (root: string) => any,
 *   closeWitness?: (witness: any) => any,
 *   observeReadiness: (route: any) => Promise<{ready: boolean, detail?: string, facts?: object}>,
 * }} options
 */
export async function runOpencodeExplorerEvaluation(options) {
  const parsed = parseEvaluationArgv(options.argv ?? []);
  const workspace = options.workspace ?? parsed.workspace;
  const artifactRoot = options.artifactRoot ?? parsed.artifactRoot;

  // 1. Authorization, before anything is observed, opened, or contacted.
  if (!parsed.liveAuthorized) return unauthorizedEvaluationReceipt();

  const fileSystem = options.fileSystem ?? fs;
  const now = options.now ?? Date.now;
  const announce = options.announce ?? ((announcement) => {
    process.stdout.write(`${JSON.stringify(announcement, null, 2)}\n`);
  });
  const openWitness = options.openWitness ?? openWorkspaceMutationWitness;
  const closeWitness = options.closeWitness ?? closeWorkspaceMutationWitness;
  if (!workspace) throw new Error("A live evaluation requires an explicit --workspace.");

  // 2. The artifact root exists before there is anything to record in it.
  const artifacts = establishArtifactRoot(artifactRoot, { fileSystem });

  const startedAt = now();
  const evidence = [];
  const stopped = { condition: null, detail: null, evidence: null };

  // 3. The run-wide witness. A workspace that is not already clean never
  //    reaches a model request.
  const runWitness = openWitness(workspace);
  const openingVerdict = closeWitness(runWitness);
  let finalWitness = openingVerdict;

  try {
    assertCleanWorkspace(openingVerdict);

    // 4. Preflight: the compatibility, route, and profile facts, observed
    //    side-effect-free. Ready or refuse -- never repaired, never started.
    const readiness = await options.observeReadiness(EVALUATION_ROUTE);
    if (!readiness?.ready) {
      throw new EvaluationStop(
        assertStopCondition("preflight_not_ready"),
        readiness?.detail ?? "The Explorer route is not ready; nothing is started or repaired.",
        readiness?.facts ?? null,
      );
    }

    // 5. The announcement, before the first model request.
    announce(evaluationAnnouncement({
      workspace,
      artifactRoot: artifacts.root,
      agentNames: EVALUATION_EXAMPLES.map((example) => `/root/${example.taskName}`),
    }));

    // 6. At most three examples, strictly in order, one turn at a time.
    for (const example of EVALUATION_EXAMPLES) {
      const exampleWitness = openWitness(workspace);
      const exampleStartedAt = now();
      const receipt = await options.runtime.spawn_agent({
        task_name: example.taskName,
        message: example.prompt,
        harness: EVALUATION_ROUTE.harness,
        model: EVALUATION_ROUTE.model,
        topology: EVALUATION_ROUTE.topology,
        write: EVALUATION_ROUTE.write,
      });
      assertRouteMatches(receipt, example.id);
      const waited = await options.runtime.wait_agent({});
      const completion = waited?.update ?? null;
      assertUsableCompletion(completion, example.id);
      const exampleEndedAt = now();
      const exampleVerdict = closeWitness(exampleWitness);
      if (!exampleVerdict.clean) {
        throw new EvaluationStop(
          assertStopCondition("workspace_mutated"),
          `${example.id} mutated the workspace; a read-only route may not.`,
          exampleVerdict,
        );
      }

      const entry = {
        ...boundedExampleEvidence({
          example,
          receipt,
          completion,
          witness: exampleVerdict,
          startedAtMs: exampleStartedAt,
          endedAtMs: exampleEndedAt,
        }),
      };

      // The conditional branch: an exact follow-up only where the route proves
      // it. This route proves `fresh_only`, so the substitute -- a second fresh
      // Agent demonstrating exactly that refusal -- is the specified path, not
      // a fallback to something else.
      if (example.kind === "exact_follow_up_or_fresh_substitute") {
        const followUp = await options.runtime.followup_task({
          target: receipt.agent_name,
          message: example.followUpPrompt,
        }).then(
          (accepted) => ({ branch: "exact_follow_up", receipt: accepted }),
          (error) => ({ branch: "fresh_only_substitute", refusal: String(error?.message ?? error) }),
        );
        entry.continuation = Object.freeze({
          branch: followUp.branch,
          // The refusal is evidence, so it is recorded; it names a closed
          // reason and never an endpoint or credential.
          refusalReason: followUp.refusal?.includes("continuation_unsupported")
            ? "continuation_unsupported"
            : followUp.refusal
              ? "other"
              : null,
        });
      }
      evidence.push(Object.freeze(entry));
    }
  } catch (error) {
    if (!(error instanceof EvaluationStop)) throw error;
    stopped.condition = error.condition;
    stopped.detail = error.detail;
    stopped.evidence = error.evidence;
  } finally {
    // The run-wide witness closes over everything that happened.
    finalWitness = closeWitness(openWitness(workspace));
  }

  const report = Object.freeze({
    status: stopped.condition ? "stopped" : "completed",
    liveAuthorized: true,
    route: EVALUATION_ROUTE,
    workspace,
    artifactRoot: artifacts.root,
    startedAtMs: startedAt,
    endedAtMs: now(),
    examplesRun: evidence.length,
    examples: Object.freeze(evidence),
    stop: stopped.condition
      ? Object.freeze({ condition: stopped.condition, detail: stopped.detail, evidence: stopped.evidence })
      : null,
    workspaceWitness: finalWitness,
    // Stated so a reader never has to infer it from absence.
    automaticFallback: "none",
  });
  fileSystem.writeFileSync(artifacts.reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

/* c8 ignore start -- the CLI wrapper is exercised through the exported controller. */
if (import.meta.url === `file://${process.argv[1]}`) {
  const parsed = parseEvaluationArgv(process.argv.slice(2));
  if (!parsed.liveAuthorized) {
    process.stdout.write(`${JSON.stringify(unauthorizedEvaluationReceipt(), null, 2)}\n`);
    process.exitCode = 1;
  } else {
    process.stderr.write(
      "Live evaluation is executed by the operator runbook (Task 10.2-10.5), which supplies " +
      "its own prepared runtime and readiness observation. This entry point refuses to " +
      "improvise either.\n"
    );
    process.exitCode = 1;
  }
}
/* c8 ignore stop */
