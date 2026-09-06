import assert from "node:assert/strict";
import test from "node:test";

import {
  createTerminalSizeChangeDetector,
  readStdoutTerminalSize,
  sameTerminalSize,
  startTerminalSizeWatcher,
  type TerminalSize,
} from "../src/terminal-size-watch.js";

test("terminal size detector reports only actual row or column changes", () => {
  const changed = createTerminalSizeChangeDetector({ rows: 30, columns: 100 });

  assert.equal(changed({ rows: 30, columns: 100 }), false);
  assert.equal(changed({ rows: 29, columns: 100 }), true);
  assert.equal(changed({ rows: 29, columns: 100 }), false);
  assert.equal(changed({ rows: 29, columns: 90 }), true);
});

test("readStdoutTerminalSize ignores the unreliable row count on Termux", () => {
  const previousTermuxVersion = process.env["TERMUX_VERSION"];
  const rows = Object.getOwnPropertyDescriptor(process.stdout, "rows");
  try {
    Object.defineProperty(process.stdout, "rows", { configurable: true, value: 24 });

    delete process.env["TERMUX_VERSION"];
    assert.equal(readStdoutTerminalSize().rows, 24);

    process.env["TERMUX_VERSION"] = "0.118.3";
    const termuxSize = readStdoutTerminalSize();
    assert.equal(termuxSize.rows, undefined);
    assert.equal(termuxSize.columns, process.stdout.columns);
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
  }
});

test("terminal size watcher repairs missed resize events", async () => {
  let currentSize: TerminalSize = { rows: 30, columns: 100 };
  let changeCount = 0;
  const stop = startTerminalSizeWatcher({
    readSize: () => currentSize,
    intervalMs: 1,
    onChange: () => {
      changeCount += 1;
    },
  });

  try {
    currentSize = { rows: 24, columns: 100 };
    await new Promise((resolve) => {
      setTimeout(resolve, 5);
    });

    assert.equal(changeCount, 1);
    assert.equal(sameTerminalSize(currentSize, { rows: 24, columns: 100 }), true);
  } finally {
    stop();
  }
});
