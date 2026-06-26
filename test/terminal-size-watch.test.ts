import assert from "node:assert/strict";
import test from "node:test";

import {
  createTerminalSizeChangeDetector,
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
