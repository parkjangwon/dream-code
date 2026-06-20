import assert from "node:assert/strict";
import test from "node:test";

import { ansi } from "../src/ansi.js";
import { formatLoginSource } from "../src/tui-login-menu.js";

test("formatLoginSource colors provider connection states", () => {
  assert.equal(formatLoginSource("env"), `${ansi.blue}env${ansi.reset}`);
  assert.equal(formatLoginSource("saved"), `${ansi.green}saved${ansi.reset}`);
  assert.equal(formatLoginSource("missing"), `${ansi.yellow}missing${ansi.reset}`);
});
