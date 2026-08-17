import {
  claimControlCommand,
  enqueueControlCommand,
  recordRequestAcknowledgement,
} from "../../../runtime/turn-control.mjs";
import { versionThreeRoute } from "./version-three-state.mjs";

const [, , mode, ...rest] = process.argv;

function binding() {
  return {
    ownerRootId: "root-1",
    agentId: "agent-1",
    jobId: "job-1",
    route: versionThreeRoute(),
  };
}

function nativeTurnRef() {
  return {
    version: 1,
    harnessId: "fake-service",
    driverVersion: "fake-service@1",
    instanceKey: "tenant-alpha",
    locatorVersion: 1,
    locator: { turnId: "t-1" },
  };
}

function run() {
  if (mode === "enqueue") {
    const [commandId] = rest;
    enqueueControlCommand({
      commandId,
      kind: "interrupt",
      ...binding(),
      nativeTurnRef: nativeTurnRef(),
    });
    return "ok";
  }
  if (mode === "claim-and-ack") {
    // Claim exclusivity is the real point of contention: two different
    // worker attempts racing for the same command must not both be able to
    // claim it, so at most one of them can ever go on to record an
    // acknowledgement.
    const [commandId, workerAttemptId, requestState] = rest;
    claimControlCommand({
      ...binding(),
      commandId,
      nativeTurnRef: nativeTurnRef(),
      workerAttemptId,
    });
    recordRequestAcknowledgement({
      ...binding(),
      commandId,
      nativeTurnRef: nativeTurnRef(),
      workerAttemptId,
      requestState,
    });
    return "ok";
  }
  throw new Error(`Unsupported contention fixture mode: ${mode}`);
}

try {
  process.stdout.write(run());
} catch (error) {
  if (/already claimed by worker attempt|already recorded requestState|already acknowledged/.test(error?.message ?? "")) {
    process.stdout.write("conflict");
  } else {
    process.stdout.write(`error:${error?.message}`);
  }
}
