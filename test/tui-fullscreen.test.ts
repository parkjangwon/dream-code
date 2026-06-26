import assert from "node:assert/strict";
import test, { mock } from "node:test";

import {
  fullscreenEnterSequence,
  fullscreenExitSequence,
  startFullscreenSession,
} from "../src/tui-fullscreen.js";

test("fullscreen sequences use alternate screen without enabling mouse capture", () => {
  const enter = fullscreenEnterSequence();
  const exit = fullscreenExitSequence();

  assert.match(enter, /\u001B\[\?1049h/u);
  assert.match(enter, /\u001B\[2J\u001B\[H/u);
  assert.doesNotMatch(enter, /\u001B\[\?1000h/u);
  assert.doesNotMatch(enter, /\u001B\[\?1006h/u);

  assert.match(exit, /\u001B\[\?1000l/u);
  assert.match(exit, /\u001B\[\?1006l/u);
  assert.match(exit, /\u001B\[\?2004l/u);
  assert.match(exit, /\u001B\[\?25h/u);
  assert.match(exit, /\u001B\[\?1049l/u);
});

test("startFullscreenSession debounces resize and removes the listener on dispose", async () => {
  let repaintCount = 0;
  let resizeSubscriberCount = 0;
  const chunks: string[] = [];
  const write = mock.method(process.stdout, "write", (chunk: string) => {
    chunks.push(chunk);
    return true;
  });
  try {
    const session = startFullscreenSession({
      repaint: () => {
        repaintCount += 1;
      },
      resizeDebounceMs: 0,
    });
    const unsubscribe = session.onResize(() => {
      resizeSubscriberCount += 1;
    });

    process.stdout.emit("resize");
    process.stdout.emit("resize");
    await new Promise((resolve) => {
      setTimeout(resolve, 5);
    });
    unsubscribe();
    session.dispose();
    session.dispose();
    process.stdout.emit("resize");
    await new Promise((resolve) => {
      setTimeout(resolve, 5);
    });

    assert.equal(repaintCount, 2);
    assert.equal(resizeSubscriberCount, 1);
    assert.equal(chunks[0], fullscreenEnterSequence());
    assert.equal(chunks.at(-1), fullscreenExitSequence());
    assert.equal(chunks.filter((chunk) => chunk === fullscreenExitSequence()).length, 1);
  } finally {
    write.mock.restore();
  }
});
