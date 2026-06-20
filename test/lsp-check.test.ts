import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import { stripAnsi } from "../src/ansi.js";
import { runLspCheck } from "../src/lsp-check.js";

test("runLspCheck handles directories without TypeScript diagnostics", async () => {
  const project = await mkdtemp(join(tmpdir(), "dream-lsp-empty-"));
  try {
    const output = stripAnsi(await runLspCheck(project));

    assert.match(output, /LSP/u);
    assert.match(output, /No TypeScript project/u);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});
