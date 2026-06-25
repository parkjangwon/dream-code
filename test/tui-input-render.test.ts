import test, { mock } from "node:test";
import assert from "node:assert/strict";

import { ansi, stripAnsi } from "../src/ansi.js";
import {
  cursorUpToPromptLineCount,
  displayInputText,
  formatCommandPaletteLine,
  formatFilePaletteLine,
  formatPaletteHeading,
  renderInputView,
  renderInputViewLineCount,
  renderInputText,
  renderPaletteDescription,
  shouldShowInlineShortcutGuide,
} from "../src/tui-input-render.js";
import { terminalVisibleWidth } from "../src/terminal-width.js";
import { createInputState } from "../src/tui-input-state.js";

test("cockpit input cursor lands on the prompt row above the footer", () => {
  assert.equal(cursorUpToPromptLineCount(5, 0), 1);
  assert.equal(cursorUpToPromptLineCount(7, 2), 3);
});

test("renderInputView batches redraw into one cursor-hidden frame", () => {
  const chunks: string[] = [];
  const stdout = mock.method(process.stdout, "write", (chunk: string) => {
    chunks.push(chunk);
    return true;
  });
  try {
    renderInputView(createInputState([], []), "> ", false, [], {
      lineCount: 3,
      promptLineIndex: 1,
      promptCursorColumn: 2,
      terminalRows: undefined,
    });

    assert.equal(chunks.length, 1);
    assert.equal(chunks[0]?.startsWith("\u001B[?25l"), true);
    assert.equal(chunks[0]?.includes("\u001B[1A\r\u001B[2K"), true);
    assert.equal(chunks[0]?.endsWith("\u001B[?25h"), true);
  } finally {
    stdout.mock.restore();
  }
});

test("renderInputView renders a compact cockpit dock instead of a boxed composer", () => {
  const chunks: string[] = [];
  const stdout = mock.method(process.stdout, "write", (chunk: string) => {
    chunks.push(chunk);
    return true;
  });
  try {
    const lineCount = renderInputViewLineCount(createInputState([], []), "> ", false, ["[model] | dream-code", "Context 0%"]);
    const rendered = stripAnsi(chunks.join(""));

    assert.equal(lineCount, 7);
    assert.doesNotMatch(rendered, /[┌┐└┘│]/u);
    assert.match(rendered, /> /u);
    assert.match(rendered, /\[model\] \| dream-code/u);
    assert.match(rendered, /Context 0%/u);
  } finally {
    stdout.mock.restore();
  }
});

test("renderInputView clears from the previous cockpit top when auxiliary height changes", () => {
  const chunks: string[] = [];
  const stdout = mock.method(process.stdout, "write", (chunk: string) => {
    chunks.push(chunk);
    return true;
  });
  try {
    const previous = renderInputView(createInputState([], []), "> ", false, []);
    renderInputView(createInputState([], []), "> ", false, [], previous);

    assert.match(chunks[1] ?? "", /\u001B\[3A\r/u);
  } finally {
    stdout.mock.restore();
  }
});

test("renderInputView pins the cockpit to the terminal bottom when rows are known", () => {
  const chunks: string[] = [];
  const stdout = mock.method(process.stdout, "write", (chunk: string) => {
    chunks.push(chunk);
    return true;
  });
  const rows = Object.getOwnPropertyDescriptor(process.stdout, "rows");
  try {
    Object.defineProperty(process.stdout, "rows", { configurable: true, value: 30 });
    const frame = renderInputView(createInputState([], []), "> ", false, ["[model] | dream-code", "Context 0%"]);

    assert.equal(frame.lineCount, 7);
    assert.match(chunks[0] ?? "", /\u001B\[24;1H/u);
    assert.match(chunks[0] ?? "", /\u001B\[27;1H/u);
  } finally {
    if (rows === undefined) {
      Reflect.deleteProperty(process.stdout, "rows");
    } else {
      Object.defineProperty(process.stdout, "rows", rows);
    }
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
