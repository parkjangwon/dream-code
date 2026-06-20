import test from "node:test";
import assert from "node:assert/strict";

import { shortcutGuideText } from "../src/tui-shortcuts.js";

test("shortcut guide uses compact codex-style inline entries", () => {
  const guide = shortcutGuideText();

  assert.match(guide, /\/ for commands/);
  assert.match(guide, /! for shell commands/);
  assert.match(guide, /tab to submit message/);
  assert.match(guide, /ctrl\+l to redraw screen/);
  assert.match(guide, /ctrl\+c twice to exit/);
  assert.doesNotMatch(guide, /\/help for commands/);
});
