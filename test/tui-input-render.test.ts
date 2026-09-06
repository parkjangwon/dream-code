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
import { createInputState, reduceInputState } from "../src/tui-input-state.js";
import type { CursorRowQuery } from "../src/terminal-cursor-query.js";

test("cockpit input cursor lands on the prompt row above the footer", () => {
  assert.equal(cursorUpToPromptLineCount(5, 0), 1);
  assert.equal(cursorUpToPromptLineCount(7, 2), 3);
});

test("renderInputView batches redraw into one cursor-hidden frame", async () => {
  const chunks: string[] = [];
  const stdout = mock.method(process.stdout, "write", (chunk: string) => {
    chunks.push(chunk);
    return true;
  });
  try {
    await renderInputView(createInputState([], []), "> ", false, [], {
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

test("renderInputView renders a compact cockpit dock instead of a boxed composer", async () => {
  const chunks: string[] = [];
  const stdout = mock.method(process.stdout, "write", (chunk: string) => {
    chunks.push(chunk);
    return true;
  });
  try {
    const lineCount = await renderInputViewLineCount(createInputState([], []), "> ", false, ["[model] | dream-code", "Context 0%"]);
    const rendered = stripAnsi(chunks.join(""));

    assert.equal(lineCount, 6);
    assert.doesNotMatch(rendered, /[┌┐└┘│]/u);
    assert.match(rendered, /> /u);
    assert.match(rendered, /\[model\] \| dream-code/u);
    assert.match(rendered, /Context 0%/u);
  } finally {
    stdout.mock.restore();
  }
});

test("renderInputView clears from the previous cockpit top when auxiliary height changes", async () => {
  const chunks: string[] = [];
  const stdout = mock.method(process.stdout, "write", (chunk: string) => {
    chunks.push(chunk);
    return true;
  });
  try {
    const previous = await renderInputView(createInputState([], []), "> ", false, []);
    await renderInputView(createInputState([], []), "> ", false, [], previous);

    assert.match(chunks[1] ?? "", /\u001B\[3A\r/u);
  } finally {
    stdout.mock.restore();
  }
});

test("renderInputView pins the cockpit to the terminal bottom when rows are known", async () => {
  const chunks: string[] = [];
  const stdout = mock.method(process.stdout, "write", (chunk: string) => {
    chunks.push(chunk);
    return true;
  });
  const rows = Object.getOwnPropertyDescriptor(process.stdout, "rows");
  try {
    Object.defineProperty(process.stdout, "rows", { configurable: true, value: 30 });
    const frame = await renderInputView(createInputState([], []), "> ", false, ["[model] | dream-code", "Context 0%"]);

    assert.equal(frame.lineCount, 6);
    assert.match(chunks[0] ?? "", /\u001B\[25;1H/u);
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

test("renderInputView avoids absolute bottom rows on Termux", async () => {
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

    const previous = await renderInputView(createInputState([], []), "> ", false, ["[model] | dream-code", "Context 0%"]);
    const typed = reduceInputState(createInputState([], []), { kind: "insert", value: "프로젝트" }).state;
    await renderInputView(typed, "> ", false, ["[model] | dream-code", "Context 0%"], previous);

    assert.doesNotMatch(chunks.join(""), /\u001B\[(?:25|27);1H/u);
    assert.match(chunks[1] ?? "", /\u001B\[3A\r/u);
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

test("renderInputView anchors the Termux redraw to the confirmed cursor row, ignoring an unstable reported height", async () => {
  const chunks: string[] = [];
  const stdout = mock.method(process.stdout, "write", (chunk: string) => {
    chunks.push(chunk);
    return true;
  });
  const rows = Object.getOwnPropertyDescriptor(process.stdout, "rows");
  const previousTermuxVersion = process.env["TERMUX_VERSION"];
  // On some devices process.stdout.rows itself swings wildly between renders
  // (observed: 56, then 31) as the on-screen keyboard resizes the viewport —
  // the redraw must not depend on it at all. The cursor is confirmed to still
  // be sitting on row 28 (this render's own prior write put it there), so the
  // redraw anchors there regardless of what output.rows claims right now.
  const cursorRowQuery: CursorRowQuery = {
    queryRow: () => Promise.resolve(28),
    shouldSuppressKeypress: () => false,
  };
  try {
    Object.defineProperty(process.stdout, "rows", { configurable: true, value: 56 });
    process.env["TERMUX_VERSION"] = "0.119.0";

    const previous = await renderInputView(createInputState([], []), "> ", false, ["[model] | dream-code", "Context 0%"]);
    const typed = reduceInputState(createInputState([], []), { kind: "insert", value: "hi" }).state;
    Object.defineProperty(process.stdout, "rows", { configurable: true, value: 31 });
    chunks.length = 0;
    await renderInputView(typed, "> ", false, ["[model] | dream-code", "Context 0%"], previous, cursorRowQuery);

    assert.equal(chunks.length, 1);
    const expectedFrameTopRow = 28 - previous.promptLineIndex;
    assert.match(chunks[0] ?? "", new RegExp(`\\u001B\\[${expectedFrameTopRow};1H`, "u"));
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
