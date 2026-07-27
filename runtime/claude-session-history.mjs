/**
 * SPDX-License-Identifier: Apache-2.0
 *
 * Read-only projection of outer Claude assistant text from a session that the
 * Agent registry already owns. Native Claude JSONL remains the authority; this
 * adapter never accepts an arbitrary path or session ID from a public caller.
 */

import fs from "node:fs";
import path from "node:path";

export const DEFAULT_AGENT_MESSAGE_LIMIT = 1;
export const MAX_AGENT_MESSAGE_LIMIT = 20;

const SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

function assertText(value, label) {
  if (typeof value !== "string" || !value.trim() || value.includes("\0")) {
    throw new Error(`${label} must be non-empty text.`);
  }
  return value.trim();
}

function optionalText(value, label) {
  if (value == null || String(value).trim() === "") return null;
  return assertText(String(value), label);
}

function messageLimit(value) {
  const limit = value == null ? DEFAULT_AGENT_MESSAGE_LIMIT : Number(value);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_AGENT_MESSAGE_LIMIT) {
    throw new Error(`read_agent_messages limit must be between 1 and ${MAX_AGENT_MESSAGE_LIMIT}.`);
  }
  return limit;
}

function isWithin(candidate, parent) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

function encodedWorkspace(workspaceRoot) {
  return assertText(workspaceRoot, "Agent workspace root").replace(/[^a-zA-Z0-9]/g, "-");
}

function canonicalProjectsRoot(claudeConfigDir) {
  const config = fs.realpathSync.native(assertText(claudeConfigDir, "Agent Claude config directory"));
  const projects = fs.realpathSync.native(path.join(config, "projects"));
  if (!isWithin(projects, config)) {
    throw new Error("Agent Claude projects directory escapes its canonical config directory.");
  }
  return projects;
}

function canonicalTopLevelTranscript(candidate, projectsRoot, sessionId) {
  let stat;
  try {
    stat = fs.statSync(candidate);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
  if (!stat.isFile()) return null;
  const canonical = fs.realpathSync.native(candidate);
  const relative = path.relative(projectsRoot, canonical);
  const segments = relative.split(path.sep);
  if (!isWithin(canonical, projectsRoot) || segments.length !== 2) {
    throw new Error("Claude transcript is not a top-level project session artifact.");
  }
  if (segments[1] !== `${sessionId}.jsonl`) {
    throw new Error("Claude transcript identity does not match the bound Agent session.");
  }
  return canonical;
}

export function resolveBoundClaudeTranscript(agent) {
  if (!agent || typeof agent !== "object" || Array.isArray(agent)) {
    throw new Error("read_agent_messages requires a resolved Agent record.");
  }
  const sessionId = assertText(agent.claudeSessionId, "Agent Claude session ID");
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    throw new Error("Agent Claude session ID is not safe for native history lookup.");
  }
  let projectsRoot;
  try {
    projectsRoot = canonicalProjectsRoot(agent.claudeConfigDir);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error("Native Claude history is unavailable for this Agent (projects directory missing or expired).", {
        cause: error,
      });
    }
    throw error;
  }

  const candidates = new Set();
  const expected = path.join(
    projectsRoot,
    encodedWorkspace(agent.workspaceRoot),
    `${sessionId}.jsonl`,
  );
  const direct = canonicalTopLevelTranscript(expected, projectsRoot, sessionId);
  if (direct) candidates.add(direct);

  for (const entry of fs.readdirSync(projectsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const candidate = canonicalTopLevelTranscript(
      path.join(projectsRoot, entry.name, `${sessionId}.jsonl`),
      projectsRoot,
      sessionId,
    );
    if (candidate) candidates.add(candidate);
  }
  if (candidates.size === 0) {
    throw new Error("Native Claude history is unavailable for this Agent (transcript missing or expired).");
  }
  if (candidates.size > 1) {
    throw new Error("Native Claude history is ambiguous for this Agent session.");
  }
  return [...candidates][0];
}

function assistantText(event, sessionId) {
  if (event?.type !== "assistant" || event?.message?.role !== "assistant") return null;
  if (event.isSidechain === true || event.sessionId !== sessionId) return null;
  const content = event.message.content;
  if (typeof content === "string") return content.length > 0 ? content : null;
  if (!Array.isArray(content)) return null;
  const text = content
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("");
  return text.length > 0 ? text : null;
}

function parseTranscript(filePath, sessionId) {
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/);
  const trailingPartial = !/\r?\n$/.test(raw);
  let lastNonEmpty = -1;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (!lines[index].trim()) continue;
    lastNonEmpty = index;
    break;
  }
  const messages = [];
  const seen = new Set();
  for (const [index, line] of lines.entries()) {
    if (!line.trim()) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch (error) {
      if (trailingPartial && index === lastNonEmpty) break;
      throw new Error("Native Claude history contains malformed JSONL.", { cause: error });
    }
    const text = assistantText(event, sessionId);
    if (text == null) continue;
    const messageId = assertText(event.uuid, "Native Claude assistant message ID");
    const timestamp = assertText(event.timestamp, "Native Claude assistant timestamp");
    if (seen.has(messageId)) {
      throw new Error("Native Claude history contains a duplicate assistant message ID.");
    }
    seen.add(messageId);
    messages.push({ messageId, timestamp, text });
  }
  return messages;
}

export function readBoundClaudeAgentMessages(agent, options = {}) {
  const limit = messageLimit(options.limit);
  const before = optionalText(options.before, "read_agent_messages before cursor");
  const sessionId = assertText(agent?.claudeSessionId, "Agent Claude session ID");
  const transcript = resolveBoundClaudeTranscript(agent);
  const newestFirst = parseTranscript(transcript, sessionId).reverse();
  let start = 0;
  if (before) {
    const cursorIndex = newestFirst.findIndex((message) => message.messageId === before);
    if (cursorIndex < 0) {
      throw new Error("read_agent_messages before cursor is not an eligible message for this Agent.");
    }
    start = cursorIndex + 1;
  }
  const messages = newestFirst.slice(start, start + limit);
  const hasMore = start + messages.length < newestFirst.length;
  return {
    messages,
    nextBefore: hasMore && messages.length > 0 ? messages.at(-1).messageId : null,
  };
}
