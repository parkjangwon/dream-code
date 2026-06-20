import assert from "node:assert/strict";
import test from "node:test";

import { terminalVisibleWidth } from "../src/terminal-width.js";
import { formatChoiceLine, isPickerBackKey } from "../src/tui-picker.js";

test("isPickerBackKey uses escape for picker back navigation", () => {
  assert.equal(isPickerBackKey("escape"), true);
  assert.equal(isPickerBackKey("c"), false);
});

test("formatChoiceLine truncates long labels and descriptions", () => {
  const line = formatChoiceLine(
    {
      value: "cso",
      label: "[x] chief-security-officer-with-a-long-name",
      description: "Chief Security Officer security audit with a very long explanation that should not wrap.",
      keywords: [],
    },
    true,
    72,
  );

  assert.equal(terminalVisibleWidth(line) <= 72, true);
  assert.match(line, /…/u);
});
