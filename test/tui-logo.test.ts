import test from "node:test";
import assert from "node:assert/strict";

import { ansi, stripAnsi } from "../src/ansi.js";
import { renderDreamLogo } from "../src/tui-logo.js";

test("dream mascot uses the warm white and beige clawd palette", () => {
  const logo = renderDreamLogo();

  assert.equal((logo[0] ?? "").includes(ansi.mascotTop), true);
  assert.equal((logo[3] ?? "").includes(ansi.mascotBody), true);
});

test("dream mascot uses a sleepy nightcap shape without old limbs", () => {
  const logo = renderDreamLogo().map(stripAnsi);

  assert.deepEqual(logo, [
    "   ▟▀▙   ",
    "  ▟▛  ▙  ",
    "  ▄▄▄▄▄  ",
    "  ▐˘ ˘▌  ",
    "  ▝███▘  ",
  ]);
  assert.equal(logo.some((line) => line.includes("▘▘") || line.includes("▝▝")), false);
});
