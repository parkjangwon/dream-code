import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { createRunningInputSession } from "../src/tui-running-input.js";

test("running input session owns mouse tracking only while streaming", () => {
  const chunks: string[] = [];
  const stdout = mock.method(process.stdout, "write", (chunk: string) => {
    chunks.push(chunk);
    return true;
  });
  const isTty = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
  const setRawMode = Object.getOwnPropertyDescriptor(process.stdin, "setRawMode");
  try {
    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: true });
    if (setRawMode === undefined) {
      Object.defineProperty(process.stdin, "setRawMode", { configurable: true, value: () => {} });
    }

    const session = createRunningInputSession(["[AUTO routing] | dream-code"]);
    session.start();
    session.stop();

    // Touch drag reaches the app (smooth scroll) while the agent streams;
    // stop() hands touch back to the terminal so idle taps raise the
    // keyboard and idle drags scroll the flushed native scrollback.
    const written = chunks.join("");
    assert.match(written, /\u001B\[\?1000h/u);
    assert.match(written, /\u001B\[\?1002h/u);
    assert.match(written, /\u001B\[\?1006h/u);
    assert.match(written, /\u001B\[\?1000l/u);
    assert.match(written, /\u001B\[\?1006l/u);
  } finally {
    if (isTty === undefined) {
      Reflect.deleteProperty(process.stdin, "isTTY");
    } else {
      Object.defineProperty(process.stdin, "isTTY", isTty);
    }
    if (setRawMode === undefined) {
      Reflect.deleteProperty(process.stdin, "setRawMode");
    } else {
      Object.defineProperty(process.stdin, "setRawMode", setRawMode);
    }
    stdout.mock.restore();
  }
});
