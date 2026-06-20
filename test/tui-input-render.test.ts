import test from "node:test";
import assert from "node:assert/strict";

import {
  cursorUpToPromptLineCount,
  displayInputText,
  renderPaletteDescription,
  shouldShowInlineShortcutGuide,
} from "../src/tui-input-render.js";
import { terminalVisibleWidth } from "../src/terminal-width.js";

test("boxed input cursor lands on the prompt row instead of the top border", () => {
  assert.equal(cursorUpToPromptLineCount(4), 2);
  assert.equal(cursorUpToPromptLineCount(11), 9);
});

test("inline shortcut guide is derived from a literal question mark input", () => {
  assert.equal(shouldShowInlineShortcutGuide("?"), true);
  assert.equal(shouldShowInlineShortcutGuide(""), false);
  assert.equal(shouldShowInlineShortcutGuide("? hello"), false);
});

test("displayInputText masks secret input without changing cursor width", () => {
  assert.equal(displayInputText("secret", true), "******");
  assert.equal(displayInputText("secret", false), "secret");
});

test("terminalVisibleWidth counts Korean text by terminal cell width", () => {
  assert.equal(terminalVisibleWidth("안녕?"), 5);
  assert.equal(terminalVisibleWidth("\u001B[35m> \u001B[0m안녕?"), 7);
});

test("renderPaletteDescription truncates long text to the available width", () => {
  const rendered = renderPaletteDescription("Chief Security Officer security audit with a very long explanation", 28);

  assert.equal(terminalVisibleWidth(rendered) <= 28, true);
  assert.match(rendered, /…/u);
});
