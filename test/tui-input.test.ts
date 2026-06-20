import assert from "node:assert/strict";
import test from "node:test";

import { ctrlCExitWindowMs, shouldExitOnRepeatedCtrlC } from "../src/tui-input.js";

test("shouldExitOnRepeatedCtrlC requires two presses within the exit window", () => {
  assert.equal(shouldExitOnRepeatedCtrlC(undefined, 1_000), false);
  assert.equal(shouldExitOnRepeatedCtrlC(1_000, 1_000 + ctrlCExitWindowMs), true);
  assert.equal(shouldExitOnRepeatedCtrlC(1_000, 1_001 + ctrlCExitWindowMs), false);
});
