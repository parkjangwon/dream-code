import assert from "node:assert/strict";
import test from "node:test";

import {
  buildProviderRequestBody,
  parseOpenAiResponsesLine,
  parseOpenAiStreamLine,
  ProviderProtocolError,
  streamEventsFromChunks,
} from "../src/llm-provider.js";

test("provider matrix covers chat, responses, native tools, and malformed streams", async () => {
  const messages = [{ role: "user", content: "inspect" }] as const;

  assert.deepEqual(buildProviderRequestBody("chat-completions", "chat-model", messages), {
    model: "chat-model",
    messages,
    stream: true,
  });
  assert.deepEqual(buildProviderRequestBody("responses", "responses-model", messages), {
    model: "responses-model",
    input: messages,
    store: false,
    stream: true,
  });
  assert.deepEqual(parseOpenAiStreamLine(
    'data: {"choices":[{"delta":{"tool_calls":[{"function":{"name":"read","arguments":"{\\"path\\":\\"README.md\\"}"}}]}}]}',
  ), { kind: "tool_call", request: { tool: "read", path: "README.md" } });
  assert.deepEqual(parseOpenAiResponsesLine(
    'data: {"type":"response.output_item.done","item":{"type":"function_call","name":"grep","arguments":"{\\"query\\":\\"TODO\\"}"}}',
  ), { kind: "tool_call", request: { tool: "grep", query: "TODO" } });

  const chunks = [Buffer.from("data: {not-json}\n\n")];
  await assert.rejects(async () => {
    for await (const _event of streamEventsFromChunks(toAsync(chunks))) {
    }
  }, ProviderProtocolError);
});

async function* toAsync(chunks: readonly Buffer[]): AsyncGenerator<Buffer> {
  for (const chunk of chunks) {
    yield chunk;
  }
}
