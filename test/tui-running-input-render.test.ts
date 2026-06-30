import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { stripAnsi } from "../src/ansi.js";
import { createInputState } from "../src/tui-input-state.js";
import { renderRunningInputView } from "../src/tui-running-input-render.js";

test("renderRunningInputView shows queue count and text-command guidance", () => {
  const chunks: string[] = [];
  const stdout = mock.method(process.stdout, "write", (chunk: string) => {
    chunks.push(chunk);
    return true;
  });
  try {
    renderRunningInputView(createInputState([], []), 2, "", ["[AUTO routing] | dream-code"], undefined);

    const rendered = stripAnsi(chunks.join(""));
    assert.match(rendered, /\[queue 2\] >/u);
    assert.match(rendered, /Enter queue · \/steer now · \/queue edit\/rm\/send · esc esc interrupt/u);
    assert.match(rendered, /\[AUTO routing\] \| dream-code/u);
  } finally {
    stdout.mock.restore();
  }
});

test("renderRunningInputView avoids absolute bottom rows on Termux", () => {
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

    renderRunningInputView(createInputState([], []), 0, "", ["[AUTO routing] | dream-code"], undefined);

    assert.doesNotMatch(chunks.join(""), /\u001B\[(?:25|27);1H/u);
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
