import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { stripAnsi } from "../src/ansi.js";
import { createInputState, reduceInputState } from "../src/tui-input-state.js";
import { renderRunningInputView, runningInputCursorSequence } from "../src/tui-running-input-render.js";
import type { CursorRowQuery } from "../src/terminal-cursor-query.js";
import { createLayeredMainWriter, layeredTerminalLayout } from "../src/tui-layered-screen.js";

test("renderRunningInputView shows queue count and text-command guidance", async () => {
  const chunks: string[] = [];
  const stdout = mock.method(process.stdout, "write", (chunk: string) => {
    chunks.push(chunk);
    return true;
  });
  try {
    await renderRunningInputView(createInputState([], []), 2, "", ["[AUTO routing] | dream-code"], undefined);

    const rendered = stripAnsi(chunks.join(""));
    assert.match(rendered, /\[queue 2\] >/u);
    assert.match(rendered, /Enter queue · \/steer now · \/queue edit\/rm\/send · esc esc interrupt/u);
    assert.match(rendered, /\[AUTO routing\] \| dream-code/u);
  } finally {
    stdout.mock.restore();
  }
});

test("renderRunningInputView avoids absolute bottom rows on Termux", async () => {
  const chunks: string[] = [];
  const stdout = mock.method(process.stdout, "write", (chunk: string) => {
    chunks.push(chunk);
    return true;
  });
  const rows = Object.getOwnPropertyDescriptor(process.stdout, "rows");
  const previousTermuxVersion = process.env["TERMUX_VERSION"];
  try {
    Object.defineProperty(process.stdout, "rows", { configurable: true, value: 30 });
    process.env["TERMUX_VERSION"] = "0.119.0";

    await renderRunningInputView(createInputState([], []), 0, "", ["[AUTO routing] | dream-code"], undefined);

    assert.doesNotMatch(chunks.join(""), /\[(?:25|27);1H/u);
  } finally {
    if (previousTermuxVersion === undefined) {
      Reflect.deleteProperty(process.env, "TERMUX_VERSION");
    } else {
      process.env["TERMUX_VERSION"] = previousTermuxVersion;
    }
    if (rows === undefined) {
      Reflect.deleteProperty(process.stdout, "rows");
    } else {
      Object.defineProperty(process.stdout, "rows", rows);
    }
    stdout.mock.restore();
  }
});

test("renderRunningInputView never pads beyond a narrow Termux viewport", async () => {
  const chunks: string[] = [];
  const columns = Object.getOwnPropertyDescriptor(process.stdout, "columns");
  const stdout = mock.method(process.stdout, "write", (chunk: string) => {
    chunks.push(chunk);
    return true;
  });
  const previousTermuxVersion = process.env["TERMUX_VERSION"];
  try {
    process.env["TERMUX_VERSION"] = "0.119.0";
    Object.defineProperty(process.stdout, "columns", { configurable: true, value: 46 });

    await renderRunningInputView(createInputState([], []), 0, "", ["[AUTO routing] | dream-code"], undefined);

    const lines = stripAnsi(chunks.join("")).split("\n");
    assert.equal(lines.every((line) => [...line].length <= 46), true);
    assert.equal(lines.some((line) => line.length === 46), true);
  } finally {
    if (previousTermuxVersion === undefined) {
      Reflect.deleteProperty(process.env, "TERMUX_VERSION");
    } else {
      process.env["TERMUX_VERSION"] = previousTermuxVersion;
    }
    if (columns === undefined) {
      Reflect.deleteProperty(process.stdout, "columns");
    } else {
      Object.defineProperty(process.stdout, "columns", columns);
    }
    stdout.mock.restore();
  }
});

test("renderRunningInputView anchors the Termux redraw to the confirmed cursor row, ignoring an unstable reported height", async () => {
  const chunks: string[] = [];
  const rows = Object.getOwnPropertyDescriptor(process.stdout, "rows");
  const stdout = mock.method(process.stdout, "write", (chunk: string) => {
    chunks.push(chunk);
    return true;
  });
  const previousTermuxVersion = process.env["TERMUX_VERSION"];
  const cursorRowQuery: CursorRowQuery = {
    queryRow: () => Promise.resolve(28),
    shouldSuppressKeypress: () => false,
  };
  try {
    process.env["TERMUX_VERSION"] = "0.119.0";
    Object.defineProperty(process.stdout, "rows", { configurable: true, value: 56 });

    const previous = await renderRunningInputView(
      createInputState([], []),
      0,
      "",
      ["[AUTO routing] | dream-code"],
      undefined,
    );
    Object.defineProperty(process.stdout, "rows", { configurable: true, value: 31 });
    chunks.length = 0;
    const rendered = await renderRunningInputView(
      createInputState([], []),
      1,
      "",
      ["[AUTO routing] | dream-code"],
      previous,
      cursorRowQuery,
    );

    assert.equal(chunks.length, 1);
    const expectedFrameTopRow = 28 - previous.promptLineIndex;
    assert.match(chunks[0] ?? "", new RegExp(`\\u001B\\[${expectedFrameTopRow};1H`, "u"));
    assert.equal(rendered.frameTopRow, expectedFrameTopRow);
    assert.match(
      runningInputCursorSequence(rendered),
      new RegExp(`\\u001B\\[${expectedFrameTopRow + rendered.promptLineIndex};1H`, "u"),
    );
  } finally {
    if (previousTermuxVersion === undefined) {
      Reflect.deleteProperty(process.env, "TERMUX_VERSION");
    } else {
      process.env["TERMUX_VERSION"] = previousTermuxVersion;
    }
    if (rows === undefined) {
      Reflect.deleteProperty(process.stdout, "rows");
    } else {
      Object.defineProperty(process.stdout, "rows", rows);
    }
    stdout.mock.restore();
  }
});

test("renderRunningInputView places the first Termux frame at the confirmed bottom and remembers its position", async () => {
  const chunks: string[] = [];
  const stdout = mock.method(process.stdout, "write", (chunk: string) => {
    chunks.push(chunk);
    return true;
  });
  const previousTermuxVersion = process.env["TERMUX_VERSION"];
  const cursorRowQuery: CursorRowQuery = {
    queryRow: () => Promise.resolve(31),
    shouldSuppressKeypress: () => false,
  };
  try {
    process.env["TERMUX_VERSION"] = "0.119.0";

    const rendered = await renderRunningInputView(
      createInputState([], []),
      0,
      "",
      ["[AUTO routing] | dream-code"],
      undefined,
      cursorRowQuery,
    );

    const expectedFrameTopRow = 31 - rendered.lineCount + 1;
    assert.equal(rendered.frameTopRow, expectedFrameTopRow);
    assert.match(chunks.join(""), /\u001B\[9999;9999H/u);
    assert.match(chunks.at(-1) ?? "", new RegExp(`\\u001B\\[${expectedFrameTopRow};1H`, "u"));
    assert.match(
      runningInputCursorSequence(rendered),
      new RegExp(`\\u001B\\[${expectedFrameTopRow + rendered.promptLineIndex};1H`, "u"),
    );
  } finally {
    if (previousTermuxVersion === undefined) {
      Reflect.deleteProperty(process.env, "TERMUX_VERSION");
    } else {
      process.env["TERMUX_VERSION"] = previousTermuxVersion;
    }
    stdout.mock.restore();
  }
});

test("Termux dock stays fixed while output streams, viewport height changes, and Korean input is typed", async () => {
  const chunks: string[] = [];
  const rows = Object.getOwnPropertyDescriptor(process.stdout, "rows");
  const stdout = mock.method(process.stdout, "write", (chunk: string) => {
    chunks.push(chunk);
    return true;
  });
  const previousTermuxVersion = process.env["TERMUX_VERSION"];
  let cursorRow = 31;
  const cursorRowQuery: CursorRowQuery = {
    queryRow: () => Promise.resolve(cursorRow),
    shouldSuppressKeypress: () => false,
  };
  try {
    process.env["TERMUX_VERSION"] = "0.119.0";
    Object.defineProperty(process.stdout, "rows", { configurable: true, value: 31 });
    let state = createInputState([], []);
    let rendered = await renderRunningInputView(
      state,
      0,
      "",
      ["[AUTO routing] | dream-code"],
      undefined,
      cursorRowQuery,
    );
    const fixedFrameTopRow = rendered.frameTopRow;
    assert.notEqual(fixedFrameTopRow, undefined);

    const writer = createLayeredMainWriter(layeredTerminalLayout(31), {
      afterWrite: () => runningInputCursorSequence(rendered),
      terminalRows: () => process.stdout.rows,
      terminalColumns: () => 80,
    });
    for (let index = 0; index < 12; index += 1) {
      chunks.length = 0;
      writer.write(`stream ${index}\n`);
      const cursorRows = [...chunks.join("").matchAll(/\u001B\[(\d+);1H/gu)];
      cursorRow = Number(cursorRows.at(-1)?.[1]);
      assert.equal(cursorRow, fixedFrameTopRow! + rendered.promptLineIndex);

      Object.defineProperty(process.stdout, "rows", {
        configurable: true,
        value: index % 2 === 0 ? 56 : 31,
      });
      state = reduceInputState(state, { kind: "insert", value: "한" }).state;
      rendered = await renderRunningInputView(
        state,
        0,
        "",
        ["[AUTO routing] | dream-code"],
        rendered,
        cursorRowQuery,
      );
      assert.equal(rendered.frameTopRow, fixedFrameTopRow);
    }
  } finally {
    if (previousTermuxVersion === undefined) {
      Reflect.deleteProperty(process.env, "TERMUX_VERSION");
    } else {
      process.env["TERMUX_VERSION"] = previousTermuxVersion;
    }
    if (rows === undefined) {
      Reflect.deleteProperty(process.stdout, "rows");
    } else {
      Object.defineProperty(process.stdout, "rows", rows);
    }
    stdout.mock.restore();
  }
});
