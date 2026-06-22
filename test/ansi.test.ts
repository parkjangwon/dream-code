import assert from "node:assert/strict";
import test from "node:test";

import { stripAnsi } from "../src/ansi.js";

test("stripAnsi removes color and cursor control sequences", () => {
  const text = "\u001B[38;5;75mThinking\u001B[0m\u001B[1A\r\u001B[2KDone";

  assert.equal(stripAnsi(text), "ThinkingDone");
});
