/**
 * SPDX-License-Identifier: Apache-2.0
 *
 * Human-readable views over public runtime receipts. JSON callers consume the
 * same underlying objects through ClaudeRuntime.
 */

function line(label, value) {
  return value == null || value === "" ? null : `- ${label}: ${value}`;
}

function sessionIdOf(job) {
  return job?.threadId ?? job?.result?.sessionId ?? null;
}

export function renderLaunch(receipt) {
  return [
    `${receipt.title} started as ${receipt.jobId}.`,
    `Check $cc-for-pein:status ${receipt.jobId}; steer with $cc-for-pein:steer ${receipt.jobId} <message>.`,
    "",
  ].join("\n");
}

export function renderTaskResult(result) {
  const output = String(result?.rawOutput ?? result?.partialOutput ?? "").trim();
  const failure = String(result?.failureMessage ?? result?.failureReason ?? "").trim();
  return `${output || failure || "Claude Code returned no text output."}\n`;
}

export function renderJobStatus(job, options = {}) {
  const steering = job?.steering && typeof job.steering === "object" ? job.steering : {};
  const partialOutput = String(job?.partialOutput ?? job?.result?.partialOutput ?? "").trim();
  const partialTail = partialOutput.slice(-4000);
  const lines = [
    `# Claude job ${job.id}`,
    "",
    line("status", job.status),
    line("phase", job.phase),
    line("summary", job.summary),
    line("Claude session", sessionIdOf(job)),
    line("recovery attempts", job.recoveryAttempts ?? job.result?.recoveryAttempts),
    line("pending steering", steering.pendingCount),
    line("latest steering ack", steering.latestAcknowledgedSequence),
    line("created", job.createdAt),
    line("updated", job.updatedAt),
    "",
  ].filter((value) => value != null);
  if (options.includePartial !== false && partialTail) {
    lines.push("## Partial output (latest)", "", partialTail, "");
  }
  return lines.join("\n");
}

export function renderStatus(report) {
  if (!report.recent?.length) return "No Claude jobs found for this workspace.\n";
  const lines = ["# Claude jobs", ""];
  for (const job of report.recent) {
    const phase = job.phase && job.phase !== job.status ? `/${job.phase}` : "";
    lines.push(`- ${job.id}: ${job.status}${phase} — ${job.summary ?? job.title ?? "task"}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function renderStoredResult(job) {
  const stored = String(job?.rendered ?? job?.result?.rawOutput ?? job?.partialOutput ?? "").trim();
  const header = renderJobStatus(job, { includePartial: false }).trimEnd();
  return stored ? `${header}\n\n## Result\n\n${stored}\n` : `${header}\n`;
}

export function renderInterrupt(receipt) {
  return receipt.interrupted
    ? `Interrupted ${receipt.jobId}; Claude session ${receipt.sessionId ?? "(pending)"} remains resumable.\n`
    : `Interrupt failed for ${receipt.jobId}: ${receipt.note ?? "unknown error"}\n`;
}

export function renderCancel(receipt) {
  return `Job ${receipt.jobId} is ${receipt.status}.${receipt.note ? ` ${receipt.note}` : ""}\n`;
}
