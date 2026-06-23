import test, { mock } from "node:test";
import assert from "node:assert/strict";

import { ansi } from "../src/ansi.js";
import {
  cursorUpToPromptLineCount,
  displayInputText,
  formatCommandPaletteLine,
  formatFilePaletteLine,
  formatPaletteHeading,
  renderInputView,
  renderInputText,
  renderPaletteDescription,
  shouldShowInlineShortcutGuide,
} from "../src/tui-input-render.js";
import { terminalVisibleWidth } from "../src/terminal-width.js";
import { createInputState } from "../src/tui-input-state.js";

test("boxed input cursor lands on the prompt row instead of the top border", () => {
  assert.equal(cursorUpToPromptLineCount(4), 2);
  assert.equal(cursorUpToPromptLineCount(11), 9);
});

test("renderInputView batches redraw into one cursor-hidden frame", () => {
  const chunks: string[] = [];
  const stdout = mock.method(process.stdout, "write", (chunk: string) => {
    chunks.push(chunk);
    return true;
  });
  try {
    renderInputView(createInputState([], []), "> ", false, [], 3);

    assert.equal(chunks.length, 1);
    assert.equal(chunks[0]?.startsWith("\u001B[?25l"), true);
    assert.equal(chunks[0]?.includes("\u001B[1A\r\u001B[2K"), true);
    assert.equal(chunks[0]?.endsWith("\u001B[?25h"), true);
  } finally {
    stdout.mock.restore();
  }
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

test("renderInputText highlights known file mentions inside the prompt input", () => {
  const rendered = renderInputText("@src/auth.ts review email@example.com @missing", false, [], [
    { path: "src/auth.ts", kind: "file", description: "auth.ts" },
  ]);

  assert.equal(rendered.includes(`${ansi.blue}@src/auth.ts`), true);
  assert.equal(rendered.includes(`${ansi.blue}@example`), false);
  assert.equal(rendered.includes(`${ansi.blue}@missing`), false);
  assert.equal(terminalVisibleWidth(rendered), terminalVisibleWidth("@src/auth.ts review email@example.com @missing"));
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

test("palette heading shows match count and selected action", () => {
  const rendered = formatPaletteHeading("Commands", 12, 0, 8, "Enter completes");

  assert.equal(rendered.includes("Commands 1-8/12"), true);
  assert.equal(rendered.includes("Enter completes"), true);
  assert.equal(rendered.includes(ansi.guide), true);
});

test("command autocomplete lines color the selected marker and command name", () => {
  const rendered = formatCommandPaletteLine({
    name: "/plugin",
    summary: "Manage Claude Code plugins",
    acceptsArgs: true,
  }, true, 80);

  assert.equal(rendered.includes(`${ansi.accent}>`), true);
  assert.equal(rendered.includes(`${ansi.accent}/plugin`), true);
  assert.equal(terminalVisibleWidth(rendered) <= 80, true);
});

test("slash skill autocomplete lines render as command entries", () => {
  const rendered = formatCommandPaletteLine({
    name: "/cso",
    summary: "Skill · Chief Security Officer security audit.",
    acceptsArgs: true,
  }, true, 80);

  assert.equal(rendered.includes(`${ansi.accent}>`), true);
  assert.equal(rendered.includes(`${ansi.accent}/cso`), true);
  assert.equal(rendered.includes("Skill"), true);
  assert.equal(terminalVisibleWidth(rendered) <= 80, true);
});

test("file autocomplete lines color selected path and kind", () => {
  const rendered = formatFilePaletteLine({
    path: "src/components/Button.tsx",
    kind: "file",
    description: "Button.tsx",
  }, true, 80);

  assert.equal(rendered.includes(`${ansi.accent}>`), true);
  assert.equal(rendered.includes(`${ansi.accent}@src/components/Button.tsx`), true);
  assert.equal(rendered.includes(`${ansi.muted}file`), true);
  assert.equal(terminalVisibleWidth(rendered) <= 80, true);
});
