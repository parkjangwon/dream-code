import assert from "node:assert/strict";
import test from "node:test";

import { stripAnsi } from "../src/ansi.js";
import { renderCockpitFrame } from "../src/tui-cockpit.js";
import { terminalVisibleWidth } from "../src/terminal-width.js";

test("renderCockpitFrame keeps every cockpit row inside the terminal width", () => {
  const frame = renderCockpitFrame({
    promptLine: "> inspect the current implementation and suggest a careful production-grade route",
    promptCursorColumn: 72,
    width: 32,
    auxiliaryLines: ["Commands 1-8/12 · Enter runs · Esc closes"],
    footerLines: ["[deepseek/deepseek-v4-flash · mid] | dream-code git:(main*)", "Context 123.4k/262.1k | YOLO bypass permissions on"],
  });

  assert.equal(frame.lines.every((line) => terminalVisibleWidth(line) <= 32), true);
  assert.match(stripAnsi(frame.lines.join("\n")), /…/u);
});

test("renderCockpitFrame keeps the prompt row offset stable below optional auxiliary rows", () => {
  const frame = renderCockpitFrame({
    promptLine: "> hello",
    promptCursorColumn: 7,
    width: 64,
    auxiliaryLines: ["one", "two", "three"],
    footerLines: ["footer one", "footer two"],
  });

  assert.equal(frame.promptRowOffsetFromBottom, 3);
  assert.equal(frame.promptCursorColumn, 7);
});
