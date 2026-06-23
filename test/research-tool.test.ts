import assert from "node:assert/strict";
import test from "node:test";

import { parseDuckDuckGoResults, parseJinaSearchResults, runResearch } from "../src/research-tool.js";

test("runResearch uses DREAM_RESEARCH_COMMAND when configured", async () => {
  const previous = process.env["DREAM_RESEARCH_COMMAND"];
  try {
    process.env["DREAM_RESEARCH_COMMAND"] = "node -e \"console.log(`search:${process.env.DREAM_QUERY}`)\"";

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

test("parseDuckDuckGoResults normalizes redirected links and snippets", () => {
  const output = parseDuckDuckGoResults([
    "<a class=\"result__a\" href=\"//duckduckgo.com/l/?uddg=https%3A%2F%2Fdocs.example.com%2Fguide&amp;rut=x\">Official &amp; Docs</a>",
    "<div class=\"result__snippet\">Use the official reference.</div>",
  ].join("\n"));

  assert.match(output, /Official & Docs/u);
  assert.match(output, /https:\/\/docs\.example\.com\/guide/u);
  assert.match(output, /Use the official reference/u);
});

test("parseJinaSearchResults normalizes DuckDuckGo redirected markdown links", () => {
  const output = parseJinaSearchResults([
    "## [Official Docs](https://duckduckgo.com/l/?uddg=https%3A%2F%2Fdocs.example.com%2Fguide)",
    "## [Second Result](https://example.com/second)",
  ].join("\n"));

  assert.match(output, /Official Docs/u);
  assert.match(output, /https:\/\/docs\.example\.com\/guide/u);
  assert.match(output, /Second Result/u);
});
