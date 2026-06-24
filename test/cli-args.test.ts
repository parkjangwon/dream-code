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

test("parseArgs routes smoke diagnostics with output flags", () => {
  const parsed = parseArgs(["smoke", "--json"]);

  assert.equal(parsed.command, "smoke");
  assert.deepEqual(parsed.rest, ["--json"]);
});

test("parseArgs routes runs audit commands", () => {
  const parsed = parseArgs(["runs", "show", "latest", "--json"]);

  assert.equal(parsed.command, "runs");
  assert.deepEqual(parsed.rest, ["show", "latest", "--json"]);
});

test("parseArgs routes release checks with output flags", () => {
  const parsed = parseArgs(["release-check", "--json"]);

  assert.equal(parsed.command, "release-check");
  assert.deepEqual(parsed.rest, ["--json"]);
});
