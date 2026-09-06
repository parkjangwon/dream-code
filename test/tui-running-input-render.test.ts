import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { stripAnsi } from "../src/ansi.js";
import { createInputState } from "../src/tui-input-state.js";
import { renderRunningInputView } from "../src/tui-running-input-render.js";
import type { CursorRowQuery } from "../src/terminal-cursor-query.js";

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

test("renderRunningInputView anchors the Termux redraw to a CPR-confirmed terminal height", async () => {
  const chunks: string[] = [];
  const stdout = mock.method(process.stdout, "write", (chunk: string) => {
    chunks.push(chunk);
    return true;
  });
  const previousTermuxVersion = process.env["TERMUX_VERSION"];
  const cursorRowQuery: CursorRowQuery = {
    queryRow: () => Promise.resolve(20),
    shouldSuppressKeypress: () => false,
  };
  try {
    process.env["TERMUX_VERSION"] = "0.119.0";

    const previous = await renderRunningInputView(
      createInputState([], []),
      0,
      "",
      ["[AUTO routing] | dream-code"],
      undefined,
      cursorRowQuery,
    );
    chunks.length = 0;
    await renderRunningInputView(
      createInputState([], []),
      1,
      "",
      ["[AUTO routing] | dream-code"],
      previous,
      cursorRowQuery,
    );

    // chunks[0] is the bottom-right-corner probe queryTerminalRows sends before
    // asking for position; chunks[1] is the actual redraw.
    assert.equal(chunks.length, 2);
    const expectedFrameTopRow = 20 - previous.lineCount + 1;
    assert.match(chunks[1] ?? "", new RegExp(`\\u001B\\[${expectedFrameTopRow};1H`, "u"));
  } finally {
    if (previousTermuxVersion === undefined) {
      Reflect.deleteProperty(process.env, "TERMUX_VERSION");
    } else {
      process.env["TERMUX_VERSION"] = previousTermuxVersion;
    }
    stdout.mock.restore();
  }
});
