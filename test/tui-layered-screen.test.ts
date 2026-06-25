import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { stripAnsi } from "../src/ansi.js";
import { defaultConfig } from "../src/config.js";
import { createLayeredMainWriter, layeredTerminalLayout, renderLayeredScreen } from "../src/tui-layered-screen.js";

test("layeredTerminalLayout reserves top chrome, middle viewport, and bottom dock rows", () => {
  assert.deepEqual(layeredTerminalLayout(30), {
    topRows: 5,
    mainStartRow: 6,
    mainRows: 19,
    bottomRows: 6,
  });
});

test("renderLayeredScreen keeps the running dock passive instead of echoing input", () => {
  const chunks: string[] = [];
  const stdout = mock.method(process.stdout, "write", (chunk: string) => {
    chunks.push(chunk);
    return true;
  });
  try {
    renderLayeredScreen({
      config: defaultConfig(),
      oneShotYolo: true,
      statusLines: ["[AUTO routing] | dream-code"],
      busyLabel: "thinking",
      guideLine: "esc interrupt · input resumes after this turn",
      terminalRows: 30,
      terminalColumns: 100,
    });

    const rendered = stripAnsi(chunks.join(""));
    assert.match(rendered, /• thinking/u);
    assert.match(rendered, /esc interrupt · input resumes after this turn/u);
    assert.doesNotMatch(rendered, /> /u);
    assert.doesNotMatch(rendered, /\? for shortcuts/u);
  } finally {
    stdout.mock.restore();
  }
});

test("createLayeredMainWriter keeps text in the middle viewport and passes monitor frames through", () => {
  const chunks: string[] = [];
  const stdout = mock.method(process.stdout, "write", (chunk: string) => {
    chunks.push(chunk);
    return true;
  });
  try {
    const writer = createLayeredMainWriter({
      topRows: 5,
      mainStartRow: 6,
      mainRows: 12,
      bottomRows: 6,
    });

    writer.write("header\nsubheader\n");
    writer.write("\u001B[?25l\u001B[8;1Hmonitor\u001B[?25h");
    writer.write("synthesis\n");

    assert.match(chunks[0] ?? "", /^\u001B\[6;1Hheader/u);
    assert.equal(chunks[1], "\u001B[?25l\u001B[8;1Hmonitor\u001B[?25h");
    assert.match(chunks[2] ?? "", /^\u001B\[6;1H/u);
    assert.match(chunks[2] ?? "", /\u001B\[2K/u);
    assert.match(chunks[2] ?? "", /\u001B\[6;1Hsynthesis/u);
  } finally {
    stdout.mock.restore();
  }
});

test("createLayeredMainWriter does not treat inline thinking animation frames as anchored monitors", () => {
  const chunks: string[] = [];
  const stdout = mock.method(process.stdout, "write", (chunk: string) => {
    chunks.push(chunk);
    return true;
  });
  try {
    const writer = createLayeredMainWriter({
      topRows: 5,
      mainStartRow: 6,
      mainRows: 12,
      bottomRows: 6,
    });

    writer.write("thinking\n");
    writer.write("\u001B[?25l\u001B[1A\r\u001B[2Kthinking.\n\u001B[?25h");
    writer.write("answer\n");

    assert.equal(chunks[1], "\u001B[?25l\u001B[1A\r\u001B[2Kthinking.\n\u001B[?25h");
    assert.doesNotMatch(chunks[2] ?? "", /\u001B\[2K/u);
    assert.match(chunks[2] ?? "", /^\u001B\[7;1Hanswer/u);
  } finally {
    stdout.mock.restore();
  }
});
