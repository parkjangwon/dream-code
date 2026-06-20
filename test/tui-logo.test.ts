import test from "node:test";
import assert from "node:assert/strict";

import { ansi } from "../src/ansi.js";
import { renderDreamLogo } from "../src/tui-logo.js";

test("dream mascot uses the warm white and beige clawd palette", () => {
  const logo = renderDreamLogo();

  assert.equal((logo[0] ?? "").includes(ansi.mascotTop), true);
  assert.equal((logo[2] ?? "").includes(ansi.mascotBody), true);
});
