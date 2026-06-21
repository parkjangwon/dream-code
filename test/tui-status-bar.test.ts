import assert from "node:assert/strict";
import test from "node:test";

import { stripAnsi } from "../src/ansi.js";
import { renderBottomStatusLines } from "../src/tui-status-bar.js";

test("renderBottomStatusLines shows model, project git state, and context percentage", () => {
  const lines = renderBottomStatusLines({
    model: "deepseek/deepseek-v4-flash",
    tier: "mid",
    projectName: "dream-code",
    gitBranch: "main",
    gitDirty: true,
    contextTokens: 13_105,
    contextWindowTokens: 262_100,
    permission: "YOLO",
  }).map(stripAnsi);

  assert.match(lines.join("\n"), /\[deepseek\/deepseek-v4-flash · mid\]/u);
  assert.match(lines.join("\n"), /dream-code git:\(main\*\)/u);
  assert.match(lines.join("\n"), /Context/u);
  assert.match(lines.join("\n"), /5%/u);
  assert.match(lines.join("\n"), /13\.1k\/262\.1k/u);
  assert.match(lines.join("\n"), /YOLO/u);
});
