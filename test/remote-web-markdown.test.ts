import assert from "node:assert/strict";
import test from "node:test";

import { parseMarkdown } from "../src/remote-web-markdown.js";

test("parseMarkdown parses pipe tables as table blocks", () => {
  // Given: Dream Code returns a compact markdown table for a mobile final answer.
  const markdown = [
    "| 구분 | 내용 |",
    "| --- | --- |",
    "| 구현 위치 | `instagram-clone/` |",
    "| 주요 구성 | Next.js App Router |",
  ].join("\n");

  // When: the remote markdown renderer parses the answer.
  const blocks = parseMarkdown(markdown);

  // Then: the table is preserved as structured cells instead of one raw paragraph.
  assert.deepEqual(blocks, [
    {
      kind: "table",
      headers: ["구분", "내용"],
      rows: [
        ["구현 위치", "`instagram-clone/`"],
        ["주요 구성", "Next.js App Router"],
      ],
    },
  ]);
});

test("parseMarkdown separates paragraphs around tables", () => {
  // Given: a final answer has prose before and after a markdown table.
  const markdown = [
    "완료했습니다.",
    "",
    "| 항목 | 결과 |",
    "| --- | --- |",
    "| 빌드 | 성공 |",
    "",
    "Done.",
  ].join("\n");

  // When: blocks are parsed.
  const blocks = parseMarkdown(markdown);

  // Then: prose and table blocks remain separate for clean mobile rendering.
  assert.equal(blocks[0]?.kind, "paragraph");
  assert.equal(blocks[1]?.kind, "table");
  assert.equal(blocks[2]?.kind, "paragraph");
});
