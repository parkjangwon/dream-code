import assert from "node:assert/strict";
import test from "node:test";

import { runResearch } from "../src/research-tool.js";

test("runResearch uses DREAM_RESEARCH_COMMAND when configured", async () => {
  const previous = process.env["DREAM_RESEARCH_COMMAND"];
  try {
    process.env["DREAM_RESEARCH_COMMAND"] = "printf \"search:$DREAM_QUERY\"";

    const result = await runResearch("official docs");

    assert.equal(result.ok, true);
    assert.match(result.output, /search:official docs/u);
  } finally {
    if (previous === undefined) {
      delete process.env["DREAM_RESEARCH_COMMAND"];
    } else {
      process.env["DREAM_RESEARCH_COMMAND"] = previous;
    }
  }
});
