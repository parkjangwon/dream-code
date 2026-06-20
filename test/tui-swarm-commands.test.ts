import assert from "node:assert/strict";
import test from "node:test";

import { parseSwarmArgs } from "../src/tui-swarm-commands.js";

test("parseSwarmArgs keeps default swarm adaptive when size is omitted", () => {
  assert.deepEqual(parseSwarmArgs("Polish the TUI"), {
    goal: "Polish the TUI",
  });
});

test("parseSwarmArgs uses size as forced swarm count", () => {
  assert.deepEqual(parseSwarmArgs("--size 12 Polish the TUI"), {
    goal: "Polish the TUI",
    forceAgents: 12,
  });
});

test("parseSwarmArgs clamps forced swarm size", () => {
  assert.deepEqual(parseSwarmArgs("--size 999 Audit everything"), {
    goal: "Audit everything",
    forceAgents: 100,
  });
});
