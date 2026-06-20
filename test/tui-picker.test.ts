import assert from "node:assert/strict";
import test from "node:test";

import { isPickerBackKey } from "../src/tui-picker.js";

test("isPickerBackKey uses escape for picker back navigation", () => {
  assert.equal(isPickerBackKey("escape"), true);
  assert.equal(isPickerBackKey("c"), false);
});
