import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
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

test("runResearch falls back to Jina Search when DuckDuckGo is blocked", async () => {
  const previousCommand = process.env["DREAM_RESEARCH_COMMAND"];
  const previousDuckDuckGo = process.env["DREAM_DUCKDUCKGO_SEARCH_BASE_URL"];
  const previousJina = process.env["DREAM_JINA_SEARCH_BASE_URL"];
  const duckDuckGo = await listenText("captcha: verify you are human");
  const jina = await listenText([
    "Title: Korea SECaaS Market",
    "URL Source: https://example.com/secaas",
    "",
    "Security as a service adoption is rising.",
  ].join("\n"));
  try {
    delete process.env["DREAM_RESEARCH_COMMAND"];
    process.env["DREAM_DUCKDUCKGO_SEARCH_BASE_URL"] = `${serverBaseUrl(duckDuckGo)}/search`;
    process.env["DREAM_JINA_SEARCH_BASE_URL"] = serverBaseUrl(jina);

    const result = await runResearch("대한민국 SECaaS 시장 동향");

    assert.equal(result.ok, true);
    assert.match(result.output, /Korea SECaaS Market/u);
    assert.match(result.output, /https:\/\/example\.com\/secaas/u);
  } finally {
    restoreEnv("DREAM_RESEARCH_COMMAND", previousCommand);
    restoreEnv("DREAM_DUCKDUCKGO_SEARCH_BASE_URL", previousDuckDuckGo);
    restoreEnv("DREAM_JINA_SEARCH_BASE_URL", previousJina);
    duckDuckGo.close();
    jina.close();
  }
});

function listenText(body: string): Promise<Server> {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    response.end(body);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function serverBaseUrl(server: Server): string {
  const address = server.address();
  if (!isAddressInfo(address)) {
    throw new Error("test server did not expose an address");
  }
  return `http://127.0.0.1:${address.port}`;
}

function isAddressInfo(value: string | AddressInfo | null): value is AddressInfo {
  return typeof value === "object" && value !== null && "port" in value;
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
