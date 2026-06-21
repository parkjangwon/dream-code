import test from "node:test";
import assert from "node:assert/strict";

import { defaultConfig } from "../src/config.js";
import { renderHeaderPanel } from "../src/tui-render.js";

test("header panel keeps upper guide lines transparent while primary color is undecided", () => {
  const panel = renderHeaderPanel(defaultConfig(), false, 80);

  assert.doesNotMatch(panel.join("\n"), /[┌┐└┘│─]/);
  assert.match(panel[0] ?? "", /Welcome to Dream Code/);
});

test("header panel omits model and permission details", () => {
  const panel = renderHeaderPanel(defaultConfig(), true, 80);
  const text = panel.join("\n");

  assert.match(text, /Directory:/u);
  assert.doesNotMatch(text, /Model:/u);
  assert.doesNotMatch(text, /Permission:/u);
  assert.doesNotMatch(text, /YOLO ON/u);
});
