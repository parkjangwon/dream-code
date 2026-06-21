import test from "node:test";
import assert from "node:assert/strict";

import { defaultConfig } from "../src/config.js";
import { DREAM_VERSION } from "../src/constants.js";
import { renderHeaderPanel } from "../src/tui-render.js";

test("header panel renders a clean text-only Dream Code header", () => {
  const panel = renderHeaderPanel(defaultConfig(), false, 80);
  const text = panel.join("\n");

  assert.doesNotMatch(text, /[╭╮╰╯│─]/u);
  assert.match(text, new RegExp(`Dream Code \\(v${DREAM_VERSION.replaceAll(".", "\\.")}\\)`, "u"));
  assert.match(text, /Even while you sleep, your dreams keep building\. ☾/u);
});

test("header panel keeps model out of the top chrome", () => {
  const panel = renderHeaderPanel(defaultConfig(), true, 80);
  const text = panel.join("\n");

  assert.match(text, /directory:/u);
  assert.doesNotMatch(text, /Model:/u);
  assert.doesNotMatch(text, /permissions:/u);
  assert.doesNotMatch(text, /YOLO mode/u);
});
