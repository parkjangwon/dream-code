import assert from "node:assert/strict";
import { emitKeypressEvents } from "node:readline";
import { PassThrough } from "node:stream";
import test from "node:test";

import { ctrlCExitWindowMs, inputFinishEchoKind, shouldExitOnRepeatedCtrlC } from "../src/tui-input.js";
import {
  createTerminalMouseInputSuppressor,
  createTerminalOutputScrollInput,
  scrollDeltaFromTerminalInput,
  scrollOutputForVerticalKey,
  setActiveOutputScroller,
} from "../src/tui-output-scroll.js";

test("shouldExitOnRepeatedCtrlC requires two presses within the exit window", () => {
  assert.equal(shouldExitOnRepeatedCtrlC(undefined, 1_000), false);
  assert.equal(shouldExitOnRepeatedCtrlC(1_000, 1_000 + ctrlCExitWindowMs), true);
  assert.equal(shouldExitOnRepeatedCtrlC(1_000, 1_001 + ctrlCExitWindowMs), false);
});

test("inputFinishEchoKind does not echo cancel text for silent submits", () => {
  assert.equal(inputFinishEchoKind({ kind: "submit", text: "/doctor" }, false, true), "none");
  assert.equal(inputFinishEchoKind({ kind: "submit", text: "/doctor" }, true, true), "submit");
  assert.equal(inputFinishEchoKind({ kind: "cancel" }, false, true), "cancel");
});

test("scrollDeltaFromTerminalInput reads SGR mouse wheel events", () => {
  assert.equal(scrollDeltaFromTerminalInput("\u001B[<64;20;10M"), 1);
  assert.equal(scrollDeltaFromTerminalInput("\u001B[<65;20;10M"), -1);
  assert.equal(scrollDeltaFromTerminalInput("text"), undefined);
});

test("scrollOutputForVerticalKey preserves keyboard arrows for input history", () => {
  let scrolled = 0;
  const unset = setActiveOutputScroller({
    scroll: (lines) => {
      scrolled += lines;
      return true;
    },
  });
  try {
    assert.equal(scrollOutputForVerticalKey({ name: "up", ctrl: false, meta: false }, { TERMUX_VERSION: "0.119.0" }), false);
    assert.equal(scrollOutputForVerticalKey({ name: "down", ctrl: false, meta: false }, { TERMUX_VERSION: "0.119.0" }), false);
    assert.equal(scrollOutputForVerticalKey({ name: "up", ctrl: false, meta: false }, { TERM_PROGRAM: "Apple_Terminal" }), false);
    assert.equal(scrolled, 0);
  } finally {
    unset();
  }
});

test("scrollOutputForVerticalKey scrolls output with page keys", () => {
  let scrolled = 0;
  const unset = setActiveOutputScroller({
    scroll: (lines) => {
      scrolled += lines;
      return true;
    },
  });
  try {
    assert.equal(scrollOutputForVerticalKey({ name: "pageup" }), true);
    assert.equal(scrolled, 8);
    assert.equal(scrollOutputForVerticalKey({ name: "pagedown" }), true);
    assert.equal(scrolled, 0);
  } finally {
    unset();
  }
});

test("terminal output scroll input maps SGR drag motion to output scroll", () => {
  let scrolled = 0;
  const unset = setActiveOutputScroller({
    scroll: (lines) => {
      scrolled += lines;
      return true;
    },
  });
  try {
    const handler = createTerminalOutputScrollInput();

    assert.equal(handler.handle("\u001B[<0;20;10M"), false);
    assert.equal(handler.handle("\u001B[<32;20;13M"), true);
    assert.equal(scrolled, 3);
    assert.equal(handler.handle("\u001B[<32;20;11M"), true);
    assert.equal(scrolled, 1);
    assert.equal(handler.handle("\u001B[<0;20;11m"), false);
    assert.equal(handler.handle("\u001B[<32;20;15M"), false);
    assert.equal(scrolled, 1);
  } finally {
    unset();
  }
});

test("terminal mouse suppressor consumes keypress fragments after raw SGR mouse input", () => {
  const suppressor = createTerminalMouseInputSuppressor();
  suppressor.observe("\u001B[<65;45;49M");

  const fragments = ["6", "5", ";", "4", "5", ";", "4", "9", "M"];
  assert.deepEqual(
    fragments.map((fragment) => suppressor.shouldSuppressKeypress(fragment, { sequence: fragment })),
    fragments.map(() => true),
  );
  assert.equal(suppressor.shouldSuppressKeypress("x", { sequence: "x" }), false);
});

test("terminal mouse suppressor consumes split SGR mouse input fragments", () => {
  const suppressor = createTerminalMouseInputSuppressor();
  suppressor.observe("\u001B[<64;19;42");

  const firstFragments = ["6", "4", ";", "1", "9", ";", "4", "2"];
  assert.equal(suppressor.shouldSuppressKeypress(undefined, { sequence: "\u001B[<" }), true);
  assert.deepEqual(
    firstFragments.map((fragment) => suppressor.shouldSuppressKeypress(fragment, { sequence: fragment })),
    firstFragments.map(() => true),
  );

  suppressor.observe("M");
  assert.equal(suppressor.shouldSuppressKeypress("M", { sequence: "M" }), true);
  assert.equal(suppressor.shouldSuppressKeypress("x", { sequence: "x" }), false);
});

test("terminal mouse suppressor consumes SGR mouse input split at every byte boundary", () => {
  for (let splitIndex = 1; splitIndex < "\u001B[<64;19;42M".length; splitIndex += 1) {
    const suppressor = createTerminalMouseInputSuppressor();
    const report = "\u001B[<64;19;42M";
    const first = report.slice(0, splitIndex);
    const second = report.slice(splitIndex);
    const fragments = ["6", "4", ";", "1", "9", ";", "4", "2", "M"];

    suppressor.observe(first);
    suppressor.observe(second);

    assert.equal(suppressor.shouldSuppressKeypress(undefined, { sequence: "\u001B[<" }), true);
    assert.deepEqual(
      fragments.map((fragment) => suppressor.shouldSuppressKeypress(fragment, { sequence: fragment })),
      fragments.map(() => true),
      `split index ${splitIndex}`,
    );
    assert.equal(suppressor.shouldSuppressKeypress("x", { sequence: "x" }), false);
  }
});

test("terminal mouse suppressor preserves normal text after a partial non-mouse escape", () => {
  const suppressor = createTerminalMouseInputSuppressor();
  suppressor.observe("\u001B[");
  suppressor.observe("A");

  assert.equal(suppressor.shouldSuppressKeypress("A", { sequence: "A" }), false);
});

test("terminal mouse suppressor works with readline when SGR mouse input splits at every byte boundary", () => {
  const report = "\u001B[<64;19;42M";
  for (let splitIndex = 1; splitIndex < report.length; splitIndex += 1) {
    assert.equal(insertedTextForTerminalChunks([report.slice(0, splitIndex), report.slice(splitIndex)]), "", `split index ${splitIndex}`);
  }
});

test("terminal mouse suppressor consumes coalesced SGR mouse input bursts", () => {
  const burst = Array.from({ length: 200 }, (_, index) => `\u001B[<${index % 2 === 0 ? 65 : 64};44;25M`).join("");
  assert.equal(insertedTextForTerminalChunks([burst]), "");
});

test("terminal mouse suppressor consumes full SGR mouse keypress fragments", () => {
  const suppressor = createTerminalMouseInputSuppressor();
  const report = "\u001B[<65;44;25M";
  suppressor.observe(report);

  assert.equal(suppressor.shouldSuppressKeypress(report, { sequence: report }), true);
  assert.equal(suppressor.shouldSuppressKeypress("x", { sequence: "x" }), false);
});

test("terminal mouse suppressor consumes mixed SGR mouse keypress fragments", () => {
  const suppressor = createTerminalMouseInputSuppressor();
  suppressor.observe("\u001B[<64;14;43M\u001B[<65;14;43M");

  assert.equal(suppressor.shouldSuppressKeypress(undefined, { sequence: "\u001B[<" }), true);
  assert.equal(suppressor.shouldSuppressKeypress("64;14;43M\u001B[<65;14;43M", { sequence: "64;14;43M\u001B[<65;14;43M" }), true);
  assert.equal(suppressor.shouldSuppressKeypress("x", { sequence: "x" }), false);
});

test("terminal mouse suppressor consumes unobserved SGR mouse tail bursts", () => {
  const suppressor = createTerminalMouseInputSuppressor();

  assert.equal(suppressor.shouldSuppressKeypress("64;19;52M64;19;52M64;19;52M", { sequence: "64;19;52M64;19;52M64;19;52M" }), true);
  assert.equal(suppressor.shouldSuppressKeypress("65;19;52M", { sequence: "65;19;52M" }), true);
  assert.equal(suppressor.shouldSuppressKeypress("66;26;30M66;26;30M", { sequence: "66;26;30M66;26;30M" }), true);
  assert.equal(suppressor.shouldSuppressKeypress("12;19;52M", { sequence: "12;19;52M" }), true);
  assert.equal(suppressor.shouldSuppressKeypress("66;26;30x", { sequence: "66;26;30x" }), false);
  assert.equal(suppressor.shouldSuppressKeypress("hello", { sequence: "hello" }), false);
});

test("terminal mouse suppressor consumes split unobserved SGR mouse tail bursts", () => {
  const suppressor = createTerminalMouseInputSuppressor();

  assert.equal(suppressor.shouldSuppressKeypress("66;26;30", { sequence: "66;26;30" }), true);
  assert.equal(suppressor.shouldSuppressKeypress("M66;26;30M", { sequence: "M66;26;30M" }), true);
  assert.equal(suppressor.shouldSuppressKeypress("65;14;27", { sequence: "65;14;27" }), true);
  assert.equal(suppressor.shouldSuppressKeypress("M65;16;28", { sequence: "M65;16;28" }), true);
  assert.equal(suppressor.shouldSuppressKeypress("M64;17;17M", { sequence: "M64;17;17M" }), true);
  assert.equal(suppressor.shouldSuppressKeypress("hello", { sequence: "hello" }), false);
});

test("terminal mouse suppressor consumes unprefixed SGR mouse data before readline splits keypresses", () => {
  assert.equal(insertedTextForTerminalChunks(["66;52;20M66;52;20M65;52;20M"]), "");
});

test("terminal mouse suppressor preserves ordinary numeric input", () => {
  assert.equal(insertedTextForTerminalChunks(["66"]), "66");
  assert.equal(insertedTextForTerminalChunks(["66;52;20x"]), "66;52;20x");
});

test("terminal mouse suppressor preserves normal text after coalesced SGR mouse input", () => {
  const burst = Array.from({ length: 200 }, (_, index) => `\u001B[<${index % 2 === 0 ? 65 : 64};44;25M`).join("");
  assert.equal(insertedTextForTerminalChunks([burst, "hello"]), "hello");
});

test("terminal mouse suppressor does not poison later input after malformed mouse report", () => {
  assert.equal(insertedTextForTerminalChunks(["\u001B[<64;19;42", "x123"]), "x123");
});

function insertedTextForTerminalChunks(chunks: readonly string[]): string {
  const input = new PassThrough();
  const suppressor = createTerminalMouseInputSuppressor();
  let inserted = "";
  input.on("data", (chunk: Buffer | string) => {
    suppressor.observe(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
  });
  emitKeypressEvents(input);
  input.on("keypress", (value: string | undefined, key: { readonly sequence?: string | undefined }) => {
    if (suppressor.shouldSuppressKeypress(value, key)) {
      return;
    }
    inserted = `${inserted}${value ?? key.sequence ?? ""}`;
  });
  for (const chunk of chunks) {
    input.write(chunk);
  }
  return inserted;
}
