import test from "node:test";
import assert from "node:assert/strict";

import {
  parseOpenAiResponsesLine,
  parseOpenAiStreamLine,
  resolveProviderSettings,
  streamEventsFromChunks,
} from "../src/llm-provider.js";

test("resolveProviderSettings supports OpenAI-compatible Kimi defaults", () => {
  const settings = resolveProviderSettings("kimi", { KIMI_API_KEY: "secret" });

  assert.equal(settings.provider, "kimi");
  assert.equal(settings.baseUrl, "https://api.moonshot.ai/v1");
  assert.equal(settings.apiKey, "secret");
});

test("resolveProviderSettings supports saved Xiaomi MiMo credentials", () => {
  const settings = resolveProviderSettings("mimo", {}, {
    apiKey: "secret",
    baseUrl: "https://api.xiaomimimo.com/v1",
    region: "payg",
  });

  assert.equal(settings.provider, "xiaomi-mimo");
  assert.equal(settings.apiKeyHeader, "api-key");
  assert.equal(settings.baseUrl, "https://api.xiaomimimo.com/v1");
});

test("resolveProviderSettings supports Responses protocol providers", () => {
  const settings = resolveProviderSettings("opencode-zen", { OPENCODE_API_KEY: "secret" });

  assert.equal(settings.protocol, "responses");
  assert.equal(settings.baseUrl, "https://opencode.ai/zen/v1");
});

test("parseOpenAiStreamLine extracts streamed content deltas", () => {
  const event = parseOpenAiStreamLine(
    'data: {"choices":[{"delta":{"content":"hello"}}]}',
  );

  assert.deepEqual(event, { kind: "content", content: "hello" });
});

test("parseOpenAiResponsesLine extracts streamed output text deltas", () => {
  const event = parseOpenAiResponsesLine(
    'data: {"type":"response.output_text.delta","delta":"hello"}',
  );

  assert.deepEqual(event, { kind: "content", content: "hello" });
});

test("streamEventsFromChunks parses split server-sent event chunks", async () => {
  const events = [];
  const chunks = [
    Buffer.from('data: {"choices":[{"delta":{"content":"hel'),
    Buffer.from('lo"}}]}\n\ndata: [DONE]\n\n'),
  ];

  for await (const event of streamEventsFromChunks(toAsync(chunks))) {
    events.push(event);
  }

  assert.deepEqual(events, [
    { kind: "content", content: "hello" },
    { kind: "skip" },
    { kind: "done" },
    { kind: "skip" },
  ]);
});

async function* toAsync(chunks: readonly Buffer[]): AsyncGenerator<Buffer> {
  for (const chunk of chunks) {
    yield chunk;
  }
}
