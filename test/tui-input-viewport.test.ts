import assert from "node:assert/strict";
import test from "node:test";

import { terminalVisibleWidth } from "../src/terminal-width.js";
import { inputViewport } from "../src/tui-input-viewport.js";

test("inputViewport keeps long input on one terminal row", () => {
  const viewport = inputViewport("abcdefghijklmnopqrstuvwxyz", 26, 10);

  assert.equal(terminalVisibleWidth(viewport.text), 10);
  assert.match(viewport.text, /^…/u);
  assert.equal(viewport.cursorColumn, 10);
});

test("inputViewport keeps the cursor visible in the middle of long input", () => {
  const viewport = inputViewport("abcdefghijklmnopqrstuvwxyz", 14, 10);

  assert.equal(terminalVisibleWidth(viewport.text) <= 10, true);
  assert.match(viewport.text, /^…/u);
  assert.match(viewport.text, /…$/u);
  assert.equal(viewport.cursorColumn < terminalVisibleWidth(viewport.text), true);
});

test("inputViewport respects wide Korean terminal cells", () => {
  const viewport = inputViewport("안녕하세요드림코드", "안녕하세요드림코드".length, 10);

  assert.equal(terminalVisibleWidth(viewport.text) <= 10, true);
  assert.match(viewport.text, /^…/u);
  assert.equal(viewport.cursorColumn, terminalVisibleWidth(viewport.text));
});
