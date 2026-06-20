import test from "node:test";
import assert from "node:assert/strict";

import { shortcutGuideText } from "../src/tui-shortcuts.js";

test("shortcut guide uses compact codex-style inline entries", () => {
  const guide = shortcutGuideText();

  assert.match(guide, /\/ command menu/);
  assert.match(guide, /! shell command/);
  assert.match(guide, /enter\/tab submit/);
  assert.match(guide, /esc close menu/);
  assert.match(guide, /ctrl\+l redraw screen/);
  assert.match(guide, /ctrl\+u\/ctrl\+k clear line/);
  assert.match(guide, /ctrl\+c twice to exit/);
  assert.match(guide, /\? show shortcuts/);
  assert.doesNotMatch(guide, /@ for file paths/);
  assert.doesNotMatch(guide, /shift\+enter/);
  assert.doesNotMatch(guide, /\/help for commands/);
});
