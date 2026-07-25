import { enqueueSteeringMessage } from "../../../runtime/job-store.mjs";

const [workspace, jobId, prefix, rawCount] = process.argv.slice(2);
const count = Number(rawCount);
for (let index = 0; index < count; index += 1) {
  enqueueSteeringMessage(workspace, jobId, `${prefix}-${index}`);
}
