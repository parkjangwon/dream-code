import assert from "node:assert/strict";
import test from "node:test";

import { isTermuxRuntime } from "../src/terminal-environment.js";

test("isTermuxRuntime detects Termux-specific environment variables", () => {
  assert.equal(isTermuxRuntime({ TERMUX_VERSION: "0.119.0" }), true);
  assert.equal(isTermuxRuntime({ PREFIX: "/data/data/com.termux/files/usr" }), true);
  assert.equal(isTermuxRuntime({ TERM_PROGRAM: "Apple_Terminal" }), false);
});
