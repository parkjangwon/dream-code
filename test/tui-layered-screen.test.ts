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

test("layeredTerminalLayout never allocates more rows than a tiny terminal has", () => {
  const layout = layeredTerminalLayout(12);

  assert.equal(layout.topRows + layout.mainRows + layout.bottomRows <= 12, true);
  assert.equal(layout.mainRows, 1);
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

    assert.match(chunks[0] ?? "", /^\u001B\[\?25l\u001B\[6;1H\u001B\[2K/u);
    assert.equal(chunks[1], "\u001B[?25l\u001B[?25l\u001B[8;1Hmonitor\u001B[?25h\u001B[?25h");
    assert.match(chunks[2] ?? "", /^\u001B\[\?25l\u001B\[6;1H/u);
    assert.match(chunks[2] ?? "", /\u001B\[2K/u);
    assert.match(chunks[2] ?? "", /\u001B\[6;1H\u001B\[2Ksynthesis/u);
  } finally {
    stdout.mock.restore();
  }
});

test("createLayeredMainWriter renders thinking animation through the middle viewport", () => {
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

    writer.write("Thinking model\n");
    writer.write("\u001B[?25l\u001B[1A\r\u001B[2KThinking. model\n\u001B[?25h");
    writer.write("answer\n");

    assert.equal(chunks.length, 3);
    assert.equal(chunks.some((chunk) => chunk.includes("\u001B[1A")), false);
    assert.match(chunks[1] ?? "", /\u001B\[6;1H\u001B\[2KThinking\. model/u);
    assert.match(chunks[2] ?? "", /\u001B\[7;1H\u001B\[2Kanswer/u);
  } finally {
    stdout.mock.restore();
  }
});

test("createLayeredMainWriter wraps CJK text without writing raw newlines into the bottom dock", () => {
  const chunks: string[] = [];
  const stdout = mock.method(process.stdout, "write", (chunk: string) => {
    chunks.push(chunk);
    return true;
  });
  try {
    const writer = createLayeredMainWriter({
      topRows: 5,
      mainStartRow: 6,
      mainRows: 3,
      bottomRows: 6,
    });

    writer.write("대표 파일: 상태가 복잡하기 때문에 회귀 위험이 높습니다. ".repeat(8));

    assert.equal(chunks.join("").includes("\n"), false);
    assert.match(chunks.join(""), /\u001B\[6;1H/u);
    assert.match(chunks.join(""), /\u001B\[7;1H/u);
    assert.match(chunks.join(""), /\u001B\[8;1H/u);
    assert.doesNotMatch(chunks.join(""), /\u001B\[9;1H/u);
  } finally {
    stdout.mock.restore();
  }
});

test("createLayeredMainWriter returns cursor ownership to the active input dock", () => {
  const chunks: string[] = [];
  const stdout = mock.method(process.stdout, "write", (chunk: string) => {
    chunks.push(chunk);
    return true;
  });
  try {
    const writer = createLayeredMainWriter(
      {
        topRows: 5,
        mainStartRow: 6,
        mainRows: 3,
        bottomRows: 6,
      },
      { afterWrite: () => "\u001B[29;12H\u001B[?25h" },
    );

    writer.write("answer\n");

    assert.match(chunks[0] ?? "", /\u001B\[6;1H\u001B\[2Kanswer/u);
    assert.equal(chunks[0]?.endsWith("\u001B[29;12H\u001B[?25h\u001B[?25h"), true);
  } finally {
    stdout.mock.restore();
  }
});

test("createLayeredMainWriter notifies after render so active docks can repair resize loss", () => {
  let repairCount = 0;
  const stdout = mock.method(process.stdout, "write", () => true);
  try {
    const writer = createLayeredMainWriter(
      {
        topRows: 5,
        mainStartRow: 6,
        mainRows: 3,
        bottomRows: 6,
      },
      {
        afterRender: () => {
          repairCount += 1;
        },
      },
    );

    writer.write("answer\n");

    assert.equal(repairCount, 1);
  } finally {
    stdout.mock.restore();
  }
});

test("createLayeredMainWriter recalculates the viewport when terminal rows shrink", () => {
  const chunks: string[] = [];
  let terminalRows = 30;
  const stdout = mock.method(process.stdout, "write", (chunk: string) => {
    chunks.push(chunk);
    return true;
  });
  try {
    const writer = createLayeredMainWriter(
      layeredTerminalLayout(terminalRows),
      {
        terminalRows: () => terminalRows,
        terminalColumns: () => 80,
      },
    );

    writer.write("one\ntwo\nthree\nfour\nfive\n");
    terminalRows = 16;
    writer.write("six\n");

    const resizedFrame = chunks.at(-1) ?? "";
    assert.match(resizedFrame, /\u001B\[6;1H/u);
    assert.match(resizedFrame, /\u001B\[10;1H/u);
    assert.doesNotMatch(resizedFrame, /\u001B\[11;1H/u);
  } finally {
    stdout.mock.restore();
  }
});

test("createLayeredMainWriter scrolls older output inside the main viewport", () => {
  const chunks: string[] = [];
  const stdout = mock.method(process.stdout, "write", (chunk: string) => {
    chunks.push(chunk);
    return true;
  });
  try {
    const writer = createLayeredMainWriter({
      topRows: 5,
      mainStartRow: 6,
      mainRows: 3,
      bottomRows: 6,
    });

    writer.write("one\ntwo\nthree\nfour\nfive");
    writer.scroll(2);

    const scrolledFrame = chunks.at(-1) ?? "";
    assert.match(scrolledFrame, /\u001B\[6;1H\u001B\[2Kone/u);
    assert.match(scrolledFrame, /\u001B\[7;1H\u001B\[2Ktwo/u);
    assert.match(scrolledFrame, /\u001B\[8;1H\u001B\[2Kthree/u);
    assert.doesNotMatch(scrolledFrame, /five/u);
  } finally {
    stdout.mock.restore();
  }
});
