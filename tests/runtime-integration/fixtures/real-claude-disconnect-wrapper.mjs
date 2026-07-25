#!/usr/bin/env node
/** Force one post-init transport-style close, then transparently delegate. */
import { spawn } from "node:child_process";
import fs from "node:fs";
import process from "node:process";

const realClaude = process.env.CC_REAL_CLAUDE_BIN;
const marker = process.env.CC_FORCED_DISCONNECT_MARKER;
if (!realClaude || !marker) {
  process.stderr.write("CC_REAL_CLAUDE_BIN and CC_FORCED_DISCONNECT_MARKER are required.\n");
  process.exit(2);
}

const args = process.argv.slice(2);
const forceDisconnect = !args.includes("--resume") && !fs.existsSync(marker);
const child = spawn(realClaude, args, {
  env: process.env,
  detached: false,
  stdio: ["pipe", "pipe", "pipe"],
});

process.stdin.on("error", () => {});
child.stdin.on("error", () => {});
process.stdin.pipe(child.stdin);
child.stderr.pipe(process.stderr);

let buffer = "";
let forced = false;
let observedSessionId = null;
child.stdout.setEncoding("utf8");
child.stdout.on("data", (chunk) => {
  buffer += chunk;
  while (buffer.includes("\n")) {
    const newline = buffer.indexOf("\n");
    const line = buffer.slice(0, newline + 1);
    buffer = buffer.slice(newline + 1);
    process.stdout.write(line);
    if (!forced && forceDisconnect) {
      try {
        const event = JSON.parse(line);
        if (event.type === "system" && event.subtype === "init" && event.session_id) {
          observedSessionId = event.session_id;
        }
        const textDelta = event.type === "stream_event" &&
          event.event?.delta?.type === "text_delta" &&
          event.event.delta.text;
        if (observedSessionId && textDelta) {
          forced = true;
          fs.writeFileSync(marker, `${observedSessionId}\n`, "utf8");
          process.stderr.write(
            "API Error: Connection closed mid-response. The response above may be incomplete.\n"
          );
          try { process.kill(child.pid, "SIGKILL"); } catch {}
        }
      } catch {}
    }
  }
});

child.on("error", (error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
child.on("close", (code, signal) => {
  if (buffer) process.stdout.write(buffer);
  if (forced) {
    process.exitCode = 1;
  } else if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exitCode = code ?? 1;
  }
});
