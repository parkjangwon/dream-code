import assert from "node:assert/strict";
import test from "node:test";

import { nextEscInterruptState } from "../src/tui-interrupt.js";

test("nextEscInterruptState requires two escape presses inside the interrupt window", () => {
  const first = nextEscInterruptState({}, 1_000);
  const second = nextEscInterruptState(first.state, 2_000);

  assert.equal(first.effect, "arm");
  assert.equal(second.effect, "abort");
});

test("nextEscInterruptState rearms when the second escape is too late", () => {
  const first = nextEscInterruptState({}, 1_000);
  const second = nextEscInterruptState(first.state, 3_000);

  assert.equal(first.effect, "arm");
  assert.equal(second.effect, "arm");
});
