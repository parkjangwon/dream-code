import test from "node:test";
import assert from "node:assert/strict";

import { stripAnsi } from "../src/ansi.js";
import { renderMarkdownTable } from "../src/tui-markdown-table.js";

test("renderMarkdownTable aligns columns with wide Korean text", () => {
  const table = renderMarkdownTable([
    "| 파일 경로 | 역할 |",
    "|---|---|",
    "| package.json | scripts |",
  ], (cell) => cell);

  assert.deepEqual(table.map(stripAnsi), [
    "│ 파일 경로    │ 역할    │",
    "│ package.json │ scripts │",
  ]);
});
