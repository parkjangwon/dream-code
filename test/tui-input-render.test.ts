import test from "node:test";
import assert from "node:assert/strict";

import { ansi } from "../src/ansi.js";
import {
  cursorUpToPromptLineCount,
  displayInputText,
  formatSkillPaletteLine,
  renderInputText,
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

test("renderInputText highlights skill mentions inside the prompt input", () => {
  const rendered = renderInputText("@cso review email@example.com", false);

  assert.equal(rendered.includes(`${ansi.blue}@cso`), true);
  assert.equal(rendered.includes(`${ansi.blue}@example`), false);
  assert.equal(terminalVisibleWidth(rendered), terminalVisibleWidth("@cso review email@example.com"));
});

test("renderInputText keeps secret input masked without mention highlighting", () => {
  assert.equal(renderInputText("@cso", true), "****");
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

test("skill autocomplete lines color the selected marker and skill name", () => {
  const rendered = formatSkillPaletteLine({
    name: "cso",
    description: "Chief Security Officer security audit.",
    body: "",
    path: "/tmp/cso/SKILL.md",
    source: "agents",
  }, true, 80);

  assert.equal(rendered.includes(`${ansi.accent}>`), true);
  assert.equal(rendered.includes(`${ansi.blue}@cso`), true);
  assert.equal(rendered.includes(`${ansi.muted}agents`), true);
  assert.equal(terminalVisibleWidth(rendered) <= 80, true);
});
