import { acquireInstanceLease, acquireNativeSessionLease } from "../../../runtime/instance-admission-lease.mjs";
import { acquireWorkspaceWriterLease } from "../../../runtime/workspace-writer-lease.mjs";
import { versionThreeRoute } from "./version-three-state.mjs";

const [, , kind, ...rest] = process.argv;

function admit() {
  if (kind === "instance") {
    const [harnessId, instanceKey, capacityClass, rawCapacityLimit, agentId, jobId] = rest;
    return acquireInstanceLease({
      ownerRootId: "root-1",
      agentId,
      jobId,
      route: versionThreeRoute(),
      harnessId,
      instanceKey,
      capacityClass,
      capacityLimit: Number(rawCapacityLimit),
    });
  }
  if (kind === "native_session") {
    const [harnessId, instanceKey, nativeSessionId, agentId, jobId] = rest;
    return acquireNativeSessionLease({
      ownerRootId: "root-1",
      agentId,
      jobId,
      route: versionThreeRoute(),
      harnessId,
      instanceKey,
      nativeSessionId,
    });
  }
  if (kind === "writer") {
    const [workspaceRoot, agentId, jobId] = rest;
    return acquireWorkspaceWriterLease({
      ownerRootId: "root-1",
      agentId,
      jobId,
      route: versionThreeRoute({ authority: "behavioral_write" }),
      workspaceRoot,
    });
  }
  throw new Error(`Unsupported contention fixture kind: ${kind}`);
}

try {
  admit();
  process.stdout.write("admitted");
} catch (error) {
  if (/capacity/i.test(error?.message ?? "")) {
    process.stdout.write("capacity_exhausted");
  } else {
    process.stdout.write(`error:${error?.message}`);
  }
}
