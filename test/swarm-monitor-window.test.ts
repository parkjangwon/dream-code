import assert from "node:assert/strict";
import test from "node:test";

import { maxVisibleSwarmLanes } from "../src/swarm-monitor-window.js";

test("maxVisibleSwarmLanes reserves bottom cockpit rows before sizing the live monitor", () => {
  const visibleLanes = maxVisibleSwarmLanes(24);

  assert.equal(visibleLanes, 8);
});
