import test from "node:test";
import assert from "node:assert/strict";

import { defaultConfig } from "../src/config.js";
import { renderHeaderPanel } from "../src/tui-render.js";

test("header panel keeps upper guide lines transparent while primary color is undecided", () => {
  const panel = renderHeaderPanel(defaultConfig(), false, 80);

  assert.doesNotMatch(panel.join("\n"), /[┌┐└┘│─]/);
  assert.match(panel[0] ?? "", /Welcome to Dream Code/);
});

test("header panel highlights yolo permission as a warning", () => {
  const panel = renderHeaderPanel(defaultConfig(), true, 80);

  assert.equal(panel.some((line) => line.includes("YOLO ON")), true);
  assert.equal(panel.some((line) => line.includes("\u001B[38;5;203m")), true);
});
