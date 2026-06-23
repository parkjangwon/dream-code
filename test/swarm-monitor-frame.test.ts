import assert from "node:assert/strict";
import test from "node:test";

import { formatSwarmMonitorFrame } from "../src/swarm-monitor-frame.js";

test("formatSwarmMonitorFrame anchors redraws to the terminal bottom when rows are known", () => {
  const frame = formatSwarmMonitorFrame("one\ntwo\nthree\n", 2, 24);

  assert.equal(frame.lineCount, 3);
  assert.match(frame.text, /\u001B\[22;1H\r\u001B\[2K/u);
  assert.match(frame.text, /\u001B\[23;1H\r\u001B\[2K/u);
  assert.match(frame.text, /\u001B\[24;1H\r\u001B\[2K/u);
  assert.match(frame.text, /\u001B\[22;1Hone\ntwo\nthree\n/u);
  assert.equal(frame.text.includes("\u001B[1A\r\u001B[2K"), false);
});

test("formatSwarmMonitorFrame preserves relative redraw fallback without terminal rows", () => {
  const frame = formatSwarmMonitorFrame("one\n", 2, undefined);

  assert.equal(frame.lineCount, 1);
  assert.equal(frame.text.includes("\u001B[1A\r\u001B[2K\u001B[1A\r\u001B[2K"), true);
});
