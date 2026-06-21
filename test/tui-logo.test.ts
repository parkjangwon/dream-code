import test from "node:test";
import assert from "node:assert/strict";

import { ansi, stripAnsi } from "../src/ansi.js";
import { renderDreamLogo } from "../src/tui-logo.js";

test("dream mascot uses a blue cap with potato face colors", () => {
  const logo = renderDreamLogo();

  assert.equal((logo[0] ?? "").includes(ansi.blue), true);
  assert.equal((logo[1] ?? "").includes(ansi.mascotTop), false);
  assert.equal((logo[2] ?? "").includes(ansi.mascotBody), true);
});

test("dream mascot renders a compact sleepy pixel bot without limbs", () => {
  const logo = renderDreamLogo().map(stripAnsi);

  assert.deepEqual(logo, [
    "  ▄▄▄▄▄  ",
    " ▟▀▀▀▀▀▙ ",
    " █ ˘ ˘ █ ",
    " █  ▄  █ ",
    "  ▀▀▀▀▀  ",
  ]);
  assert.equal(new Set(logo.map((line) => line.length)).size, 1);
  assert.equal(logo.some((line) => line.includes("▘▘") || line.includes("▝▝")), false);
});
