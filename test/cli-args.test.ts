import assert from "node:assert/strict";
import test from "node:test";

import { parseArgs } from "../src/cli-args.js";

test("parseArgs routes -p to prompt mode", () => {
  const parsed = parseArgs(["-p", "summarize this repo"]);

  assert.equal(parsed.command, "prompt");
  assert.equal(parsed.prompt, "summarize this repo");
  assert.equal(parsed.oneShotYolo, false);
});

test("parseArgs routes --prompt with yolo to prompt mode", () => {
  const parsed = parseArgs(["--yolo", "--prompt", "fix the tests"]);

  assert.equal(parsed.command, "prompt");
  assert.equal(parsed.prompt, "fix the tests");
  assert.equal(parsed.oneShotYolo, true);
});

test("parseArgs preserves prompt mode output flags after the prompt text", () => {
  const parsed = parseArgs(["-p", "fix", "tests", "--json", "--quiet"]);

  assert.equal(parsed.command, "prompt");
  assert.equal(parsed.prompt, "fix tests");
  assert.equal(parsed.json, true);
  assert.equal(parsed.quiet, true);
});
