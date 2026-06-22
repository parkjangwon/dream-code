import assert from "node:assert/strict";
import test from "node:test";

import { stripAnsi } from "../src/ansi.js";
import { formatSwarmHeader, formatSwarmSynthesis } from "../src/swarm-output.js";

test("formatSwarmHeader labels overdrive mode", () => {
  const output = stripAnsi(formatSwarmHeader(10, false, "overdrive"));

  assert.match(output, /✹ Dream Swarm OVERDRIVE 10 parallel lanes/u);
  assert.match(output, /Dream overdrive · adversarial review on/u);
});

test("formatSwarmHeader labels hidden exact-lane overdrive", () => {
  const output = stripAnsi(formatSwarmHeader(25, true, "overdrive"));

  assert.match(output, /✹ Dream Swarm OVERDRIVE 25 parallel lanes/u);
  assert.match(output, /Dream exact-lane overdrive · adversarial review on/u);
});

test("formatSwarmSynthesis shows total elapsed time and token estimate on completion line", () => {
  const output = stripAnsi(formatSwarmSynthesis("Merged result", 67_200, 5_295));

  assert.match(output, /✓ Done 67\.2s · ~1327 tokens/u);
});

test("formatSwarmSynthesis removes trailing response done chrome from the synthesis body", () => {
  const output = stripAnsi(formatSwarmSynthesis("Merged result\n✓ Done 1.0s · ~999 tokens", 2_000));

  assert.equal((output.match(/✓ Done/gu) ?? []).length, 1);
  assert.match(output, /✓ Done 2\.0s · ~4 tokens/u);
});
