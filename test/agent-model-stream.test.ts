import assert from "node:assert/strict";
import test from "node:test";

import { nativeToolNames } from "../src/agent-model-stream.js";

test("native tool list exposes web research and fetch tools", () => {
  const names = nativeToolNames();

  assert.equal(names.includes("research"), true);
  assert.equal(names.includes("fetch"), true);
});
