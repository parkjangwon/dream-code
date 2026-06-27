import assert from "node:assert/strict";
import { emitKeypressEvents } from "node:readline";
import { PassThrough } from "node:stream";
import test from "node:test";

import { ctrlCExitWindowMs, shouldExitOnRepeatedCtrlC } from "../src/tui-input.js";
import {
  createTerminalMouseInputSuppressor,
  scrollDeltaFromTerminalInput,
  scrollOutputForVerticalKey,
  setActiveOutputScroller,
} from "../src/tui-output-scroll.js";

test("shouldExitOnRepeatedCtrlC requires two presses within the exit window", () => {
  assert.equal(shouldExitOnRepeatedCtrlC(undefined, 1_000), false);
  assert.equal(shouldExitOnRepeatedCtrlC(1_000, 1_000 + ctrlCExitWindowMs), true);
  assert.equal(shouldExitOnRepeatedCtrlC(1_000, 1_001 + ctrlCExitWindowMs), false);
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

test("terminal mouse suppressor consumes unobserved wheel tail bursts", () => {
  const suppressor = createTerminalMouseInputSuppressor();

  assert.equal(suppressor.shouldSuppressKeypress("64;19;52M64;19;52M64;19;52M", { sequence: "64;19;52M64;19;52M64;19;52M" }), true);
  assert.equal(suppressor.shouldSuppressKeypress("65;19;52M", { sequence: "65;19;52M" }), true);
  assert.equal(suppressor.shouldSuppressKeypress("12;19;52M", { sequence: "12;19;52M" }), false);
  assert.equal(suppressor.shouldSuppressKeypress("hello", { sequence: "hello" }), false);
});

test("terminal mouse suppressor consumes split unobserved wheel tail bursts", () => {
  const suppressor = createTerminalMouseInputSuppressor();

  assert.equal(suppressor.shouldSuppressKeypress("65;14;27", { sequence: "65;14;27" }), true);
  assert.equal(suppressor.shouldSuppressKeypress("M65;16;28", { sequence: "M65;16;28" }), true);
  assert.equal(suppressor.shouldSuppressKeypress("M64;17;17M", { sequence: "M64;17;17M" }), true);
  assert.equal(suppressor.shouldSuppressKeypress("hello", { sequence: "hello" }), false);
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
