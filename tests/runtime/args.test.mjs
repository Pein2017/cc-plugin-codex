import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseArgs } from "../../runtime/args.mjs";

describe("strict runtime argument parsing", () => {
  it("rejects unknown long and short options instead of injecting them into a prompt", () => {
    const config = { valueOptions: ["task-name"], booleanOptions: ["json"] };
    assert.throws(
      () => parseArgs(["--claude-session-id", "foreign"], config),
      /Unknown option --claude-session-id/
    );
    assert.throws(() => parseArgs(["-x"], config), /Unknown option -x/);
  });

  it("requires the explicit separator for positional text that starts with a dash", () => {
    const parsed = parseArgs(["--task-name", "agent", "--", "--literal-message"], {
      valueOptions: ["task-name"],
    });
    assert.equal(parsed.options["task-name"], "agent");
    assert.deepEqual(parsed.positionals, ["--literal-message"]);
  });

  it("never consumes an unknown dash-prefixed token as an implicit value", () => {
    const config = { valueOptions: ["message"] };
    assert.throws(
      () => parseArgs(["--message", "--claude-session-id", "foreign"], config),
      /Missing value for --message/
    );
    assert.deepEqual(
      parseArgs(["--message=-literal"], config),
      { options: { message: "-literal" }, positionals: [] }
    );
  });
});
