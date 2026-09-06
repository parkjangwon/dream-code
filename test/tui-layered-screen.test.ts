import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { EventEmitter } from "node:events";

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

test("renderLayeredScreen keeps the running dock passive instead of echoing input", async () => {
  const chunks: string[] = [];
  const stdout = mock.method(process.stdout, "write", (chunk: string) => {
    chunks.push(chunk);
    return true;
  });
  try {
    await renderLayeredScreen({
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

test("renderLayeredScreen anchors the bottom dock to a CPR-confirmed row count on Termux", async () => {
  const chunks: string[] = [];
  const input = new EventEmitter() as unknown as NodeJS.ReadStream;
  const stdout = mock.method(process.stdout, "write", (chunk: string) => {
    chunks.push(chunk);
    if (chunk.includes("[6n")) {
      // The unreliable process.stdout.rows (passed as terminalRows below) says
      // 30, but the terminal itself reports a true height of 18 once probed.
      queueMicrotask(() => input.emit("data", "[18;80R"));
    }
    return true;
  });
  const previousTermuxVersion = process.env["TERMUX_VERSION"];
  try {
    process.env["TERMUX_VERSION"] = "0.119.0";

    const layout = await renderLayeredScreen({
      config: defaultConfig(),
      oneShotYolo: true,
      statusLines: ["[AUTO routing] | dream-code"],
      busyLabel: "thinking",
      guideLine: "esc interrupt · input resumes after this turn",
      terminalRows: 30,
      terminalColumns: 100,
      input,
    });

    // The layout must be derived from the confirmed height (18), not the
    // unreliable terminalRows: 30 that was passed in.
    assert.deepEqual(layout, layeredTerminalLayout(18));
    const written = chunks.join("");
    assert.match(written, /\[9999;9999H/u);
    // The bottom dock (5 lines) belongs at row 14 (18 - 5 + 1) when anchored to
    // the confirmed height, not row 26 (30 - 5 + 1) from the stale terminalRows.
    assert.match(written, /\[14;1H/u);
    assert.doesNotMatch(written, /\[26;1H/u);
  } finally {
    if (previousTermuxVersion === undefined) {
      Reflect.deleteProperty(process.env, "TERMUX_VERSION");
    } else {
      process.env["TERMUX_VERSION"] = previousTermuxVersion;
    }
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
    writer.write("[?25l[8;1Hmonitor[?25h");
    writer.write("synthesis\n");

    assert.match(chunks[0] ?? "", /^\[\?25l\[6;1H\[2K/u);
    assert.equal(chunks[1], "[?25l[?25l[8;1Hmonitor[?25h[?25h");
    assert.match(chunks[2] ?? "", /^\[\?25l\[6;1H/u);
    assert.match(chunks[2] ?? "", /\[2K/u);
    assert.match(chunks[2] ?? "", /\[6;1H\[2Ksynthesis/u);
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
    writer.write("[?25l[1A\r[2KThinking. model\n[?25h");
    writer.write("answer\n");

    assert.equal(chunks.length, 3);
    assert.equal(chunks.some((chunk) => chunk.includes("[1A")), false);
    assert.match(chunks[1] ?? "", /\[6;1H\[2KThinking\. model/u);
    assert.match(chunks[2] ?? "", /\[7;1H\[2Kanswer/u);
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
    assert.match(chunks.join(""), /\[6;1H/u);
    assert.match(chunks.join(""), /\[7;1H/u);
    assert.match(chunks.join(""), /\[8;1H/u);
    assert.doesNotMatch(chunks.join(""), /\[9;1H/u);
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
      { afterWrite: () => "[29;12H[?25h" },
    );

    writer.write("answer\n");

    assert.match(chunks[0] ?? "", /\[6;1H\[2Kanswer/u);
    assert.equal(chunks[0]?.endsWith("[29;12H[?25h[?25h"), true);
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
    assert.match(resizedFrame, /\[6;1H/u);
    assert.match(resizedFrame, /\[10;1H/u);
    assert.doesNotMatch(resizedFrame, /\[11;1H/u);
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
    assert.match(scrolledFrame, /\[6;1H\[2Kone/u);
    assert.match(scrolledFrame, /\[7;1H\[2Ktwo/u);
    assert.match(scrolledFrame, /\[8;1H\[2Kthree/u);
    assert.doesNotMatch(scrolledFrame, /five/u);
  } finally {
    stdout.mock.restore();
  }
});
