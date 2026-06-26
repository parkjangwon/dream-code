import assert from "node:assert/strict";
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
  assert.equal(scrollDeltaFromTerminalInput("\u001B[<64;20;10M"), 3);
  assert.equal(scrollDeltaFromTerminalInput("\u001B[<65;20;10M"), -3);
  assert.equal(scrollDeltaFromTerminalInput("text"), undefined);
});

test("scrollOutputForVerticalKey consumes Termux up and down keys for active output scrolling", () => {
  let scrolled = 0;
  const unset = setActiveOutputScroller({
    scroll: (lines) => {
      scrolled += lines;
      return true;
    },
  });
  try {
    assert.equal(scrollOutputForVerticalKey({ name: "up", ctrl: false, meta: false }, { TERMUX_VERSION: "0.119.0" }), true);
    assert.equal(scrollOutputForVerticalKey({ name: "down", ctrl: false, meta: false }, { TERMUX_VERSION: "0.119.0" }), true);
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
