import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  cancelClaudeProcess,
  interruptClaudeProcess,
} from "../../runtime/claude-headless-adapter.mjs";
import { getProcessIdentity } from "../../runtime/process-control.mjs";

describe("cross-platform process control", () => {
  it("uses process creation time and path as native Windows identity", () => {
    let command = null;
    const identity = getProcessIdentity(42, {
      platform: "win32",
      runCommandCheckedImpl: (name, args) => {
        command = { name, args };
        return { stdout: "638900000000000000|C:\\Program Files\\nodejs\\node.exe\r\n" };
      },
    });
    assert.equal(identity, "638900000000000000|C:\\Program Files\\nodejs\\node.exe");
    assert.equal(command.name, "powershell.exe");
    assert.equal(command.args.includes("-NonInteractive"), true);
  });

  it("fails honestly when graceful Windows SIGINT is unavailable", async () => {
    const receipt = await interruptClaudeProcess(42, null, { platform: "win32" });
    assert.equal(receipt.interrupted, false);
    assert.match(receipt.note, /Graceful SIGINT is unavailable/);
  });

  it("uses taskkill semantics for destructive Windows cancellation", async () => {
    let invocation = null;
    const receipt = await cancelClaudeProcess(42, null, {
      platform: "win32",
      runCommandImpl: (command, args) => {
        invocation = { command, args };
        return { command, args, status: 0, signal: null, stdout: "", stderr: "", error: null };
      },
      isProcessAliveImpl: () => false,
    });
    assert.equal(receipt.cancelled, true);
    assert.deepEqual(invocation, {
      command: "taskkill",
      args: ["/PID", "42", "/T", "/F"],
    });
  });
});
