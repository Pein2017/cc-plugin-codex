import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  NATIVE_TEAM_POLICY_REVISION,
  assessObservedNativeSurface,
  canonicalizeInitToolName,
  deriveNativeCohortLabel,
  resolveNativeTeamPolicy,
} from "../../runtime/claude-native-team-policy.mjs";

const COMMON_DENIED_TOOLS = [
  "Workflow",
  "ListAgents",
  "ListPeers",
  "ScheduleWakeup",
  "CronCreate",
  "CronDelete",
  "CronList",
  "CronUpdate",
  "RemoteTrigger",
  "PushNotification",
  "SendUserMessage",
  "SendUserFile",
  "SendFile",
  "EnterWorktree",
  "ExitWorktree",
];

const NECESSARY_COORDINATION_TOOLS = [
  "Agent",
  "SendMessage",
  "TaskCreate",
  "TaskGet",
  "TaskList",
  "TaskUpdate",
];

function policy(input) {
  return resolveNativeTeamPolicy({
    model: "claude-opus-5",
    delegationMode: "claude_orchestrator",
    write: false,
    jobId: "job-native-policy-1",
    ...input,
  });
}

describe("bounded native Claude team policy", () => {
  it("admits exact Opus and Fable native-team leads with a stable opaque cohort", () => {
    assert.equal(NATIVE_TEAM_POLICY_REVISION, "cc-native-team-v1");
    assert.equal(
      deriveNativeCohortLabel("job-native-policy-1"),
      "cc-native-team-cfa2d72637b6c12d",
    );
    assert.equal(
      deriveNativeCohortLabel("job-native-policy-1"),
      deriveNativeCohortLabel("job-native-policy-1"),
    );
    assert.notEqual(
      deriveNativeCohortLabel("job-native-policy-1"),
      deriveNativeCohortLabel("job-native-policy-2"),
    );
    assert.doesNotMatch(deriveNativeCohortLabel("job-native-policy-1"), /job-native-policy-1/);

    for (const model of ["claude-opus-5", "claude-fable-5"]) {
      const resolved = policy({ model });
      assert.equal(resolved.role, "native_team_lead");
      assert.equal(resolved.cohortLabel, "cc-native-team-cfa2d72637b6c12d");
      assert.deepEqual(resolved.limits, {
        maxSpawnDepth: 1,
        maxConcurrentTeammates: 3,
        maxCreations: 6,
      });
      assert.ok(Object.isFrozen(resolved));
      assert.ok(Object.isFrozen(resolved.teammateDefinitions));
    }
  });

  it("rejects unsupported semantic role combinations before any profile mapping", () => {
    for (const model of ["claude-sonnet-5", "claude-haiku-4-5", "opus", "fable"]) {
      assert.throws(
        () => policy({ model }),
        /claude_orchestrator delegation requires exact model claude-opus-5 or claude-fable-5/,
      );
    }
    assert.throws(
      () => policy({
        model: "claude-haiku-4-5",
        delegationMode: "leaf",
        write: true,
        jobId: undefined,
      }),
      /Haiku is valid only as a write:false leaf scout/,
    );
    assert.throws(
      () => policy({ jobId: "" }),
      /requires a durable jobId/,
    );
  });

  it("defines exactly the stable bounded teammates without unsupported overrides", () => {
    const resolved = policy({ write: true });
    assert.deepEqual(
      resolved.teammateDefinitions.map((definition) => definition.name),
      ["haiku-scout", "sonnet", "opus"],
    );
    assert.deepEqual(
      resolved.teammateDefinitions.map((definition) => definition.model),
      ["claude-haiku-4-5", "claude-sonnet-5", "claude-opus-5"],
    );
    assert.deepEqual(
      resolved.teammateDefinitions.map((definition) => definition.description),
      [
        "Read-only bounded reconnaissance for the current Native Agent Team.",
        "Bounded implementation, investigation, or review for the current Native Agent Team.",
        "Bounded implementation, investigation, or verification for the current Native Agent Team.",
      ],
    );
    for (const definition of resolved.teammateDefinitions) {
      assert.ok(definition.description.trim());
      assert.equal(definition.memory, "local");
      assert.deepEqual(definition.disallowedTools, [...COMMON_DENIED_TOOLS, "Agent"]);
      for (const forbiddenOverride of [
        "effort",
        "background",
        "isolation",
        "permissionMode",
        "permissions",
        "skills",
        "mcpServers",
      ]) {
        assert.equal(definition[forbiddenOverride], undefined, `${definition.name}: ${forbiddenOverride}`);
      }
      assert.match(definition.prompt, /omit call-level model and isolation overrides/i);
      assert.match(definition.prompt, /remote, worktree, or fork/i);
      assert.match(definition.prompt, /do not delegate or use Agent\/Workflow/i);
      assert.match(definition.prompt, /current-team shared tasks and SendMessage only for bounded evidence or blockers/i);
      assert.match(definition.prompt, /do not use cross-session recipients or peer-driven resume of completed teammates/i);
    }
    assert.match(resolved.teammateDefinitions[0].prompt, /must not mutate task, workspace, repository, or external state/i);
    assert.match(resolved.prompt, /experimental Native Agent Team/i);
    assert.match(resolved.prompt, /at most three concurrently active teammates/i);
    assert.match(resolved.prompt, /at most six teammate creations/i);
    assert.match(resolved.prompt, /behavioral.*not process-enforced/i);
    assert.match(resolved.prompt, /intended effort.*inherited or unknown effective effort/i);
    assert.ok(
      policy({ write: false }).prompt.includes(
        "Only native local-memory maintenance under .claude/agent-memory-local/<member-type>/ is allowed.",
      ),
    );
  });

  it("allows read-only members only their type-scoped native local-memory maintenance", () => {
    const readOnly = policy({ write: false });
    for (const definition of readOnly.teammateDefinitions) {
      assert.ok(
        definition.prompt.includes(
          `Only native local-memory maintenance under .claude/agent-memory-local/${definition.name}/ is allowed.`,
        ),
      );
      assert.match(definition.prompt, /must not mutate task, workspace, repository, or external state/i);
    }

    const writingTeamHaiku = policy({ write: true }).teammateDefinitions[0];
    assert.ok(
      writingTeamHaiku.prompt.includes(
        "Only native local-memory maintenance under .claude/agent-memory-local/haiku-scout/ is allowed.",
      ),
    );
    assert.match(writingTeamHaiku.prompt, /must not mutate task, workspace, repository, or external state/i);
  });

  it("keeps its complete deterministic result free of process and persistence controls", () => {
    const first = policy({ write: false });
    const second = policy({ write: false });
    assert.deepEqual(first, second);
    const encoded = JSON.stringify(first);
    assert.doesNotMatch(encoded, /childEnv|CLAUDE_CODE_|--agents|--disallowedTools|retry|persist/i);
  });

  it("owns the reviewed lead, member, and leaf deny differences", () => {
    const lead = policy();
    assert.deepEqual(lead.deniedToolNames, COMMON_DENIED_TOOLS);
    assert.deepEqual(lead.necessaryCoordinationToolNames, NECESSARY_COORDINATION_TOOLS);

    const leaf = policy({
      model: "claude-sonnet-5",
      delegationMode: "leaf",
      jobId: undefined,
    });
    assert.equal(leaf.role, "leaf");
    assert.equal(leaf.cohortLabel, null);
    assert.deepEqual(leaf.teammateDefinitions, []);
    assert.deepEqual(leaf.deniedToolNames, [...COMMON_DENIED_TOOLS, "Agent", "SendMessage"]);
    assert.deepEqual(leaf.necessaryCoordinationToolNames, []);
  });

  it("canonicalizes the Claude init Task alias only", () => {
    assert.equal(canonicalizeInitToolName("Task"), "Agent");
    assert.equal(canonicalizeInitToolName(" Agent "), "Agent");
    assert.equal(canonicalizeInitToolName("SendMessage"), "SendMessage");
    assert.equal(canonicalizeInitToolName("mcp__coordexp__probe"), "mcp__coordexp__probe");
    assert.equal(canonicalizeInitToolName(null), null);
  });

  it("classifies complete init inventories before any later display cap", () => {
    const assessed = assessObservedNativeSurface({
      delegationMode: "claude_orchestrator",
      toolNames: [
        "Task",
        "SendMessage",
        "TaskCreate",
        "TaskGet",
        "TaskList",
        "TaskUpdate",
        "Read",
        "mcp__coordexp__probe",
        "FutureNativeTool",
        "ListAgents",
      ],
      definitionNames: ["opus", "haiku-scout", "sonnet"],
    });
    assert.deepEqual(assessed, {
      observed: true,
      delegationMode: "claude_orchestrator",
      definitionNames: ["haiku-scout", "opus", "sonnet"],
      canonicalToolNames: [
        "Agent",
        "FutureNativeTool",
        "ListAgents",
        "Read",
        "SendMessage",
        "TaskCreate",
        "TaskGet",
        "TaskList",
        "TaskUpdate",
      ],
      missingDefinitions: [],
      missingNecessaryCoordinationTools: [],
      forbiddenTools: ["ListAgents"],
      unknownNativeTools: ["FutureNativeTool"],
      denySetLiveValidated: false,
      teamTransportLiveValidated: false,
    });
  });

  it("requires the orchestrator inventories while allowing an unobserved leaf", () => {
    assert.deepEqual(
      assessObservedNativeSurface({ delegationMode: "leaf" }),
      {
        observed: false,
        delegationMode: "leaf",
        definitionNames: [],
        canonicalToolNames: [],
        missingDefinitions: [],
        missingNecessaryCoordinationTools: [],
        forbiddenTools: [],
        unknownNativeTools: [],
        denySetLiveValidated: false,
        teamTransportLiveValidated: false,
      },
    );

    const missing = assessObservedNativeSurface({
      delegationMode: "claude_orchestrator",
      toolNames: ["Task", "SendMessage", "TaskCreate"],
      definitionNames: ["haiku-scout"],
    });
    assert.deepEqual(missing.missingDefinitions, ["opus", "sonnet"]);
    assert.deepEqual(missing.missingNecessaryCoordinationTools, ["TaskGet", "TaskList", "TaskUpdate"]);
    assert.equal(missing.denySetLiveValidated, true);
  });

  it("fails closed when a present native inventory is malformed", () => {
    for (const toolNames of [[null], [""], "Task"]) {
      assert.throws(
        () => assessObservedNativeSurface({ delegationMode: "leaf", toolNames }),
        /Malformed native tool inventory/,
      );
    }
    for (const definitionNames of [[null], ["  "], "haiku-scout"]) {
      assert.throws(
        () => assessObservedNativeSurface({ delegationMode: "leaf", definitionNames }),
        /Malformed native definition inventory/,
      );
    }
  });

  it("fails closed when the native surface input is not a plain object", () => {
    for (const input of ["surface", [], 7, new Date()]) {
      assert.throws(
        () => assessObservedNativeSurface(input),
        /Malformed native surface input/,
      );
    }
    assert.equal(assessObservedNativeSurface(undefined).observed, false);
  });
});
