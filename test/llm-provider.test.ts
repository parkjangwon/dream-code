import test from "node:test";
import assert from "node:assert/strict";

import {
  buildProviderRequestHeaders,
  buildProviderRequestBody,
  nativeAgentToolDefinitions,
  parseOpenAiResponsesLine,
  parseOpenAiStreamLine,
  resolveProviderSettingsForRequest,
  resolveProviderSettings,
  streamChatCompletion,
  streamEventsFromChunks,
} from "../src/llm-provider.js";
import { codexAuthFilePath, codexOAuthBaseUrl } from "../src/codex-oauth.js";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

test("resolveProviderSettings supports keyless Ollama defaults", () => {
  const settings = resolveProviderSettings("ollama", {});

  assert.equal(settings.provider, "ollama");
  assert.equal(settings.baseUrl, "http://127.0.0.1:11434/v1");
  assert.equal(settings.apiKey, undefined);
  assert.deepEqual(buildProviderRequestHeaders(settings), {
    "content-type": "application/json",
  });
});

test("resolveProviderSettings normalizes Ollama native API base URLs", () => {
  const settings = resolveProviderSettings("ollama", {
    DREAM_OLLAMA_BASE_URL: "http://127.0.0.1:11434",
  });

  assert.equal(settings.baseUrl, "http://127.0.0.1:11434/v1");
});

test("resolveProviderSettingsForRequest supports OpenAI OAuth through Codex auth", async () => {
  const home = await mkdtemp(join(tmpdir(), "dream-provider-oauth-"));
  try {
    await mkdir(home, { recursive: true });
    await writeFile(codexAuthFilePath({ CODEX_HOME: home }), JSON.stringify({
      auth_mode: "chatgpt",
      tokens: {
        access_token: fakeJwt(4_102_444_800),
        refresh_token: "refresh-token",
        account_id: "acct_test",
      },
    }));

    const settings = await resolveProviderSettingsForRequest("openai", { CODEX_HOME: home }, {
      authMode: "oauth",
      region: "chatgpt",
      baseUrl: codexOAuthBaseUrl,
    });

    assert.equal(settings.provider, "openai");
    assert.equal(settings.protocol, "responses");
    assert.equal(settings.baseUrl, codexOAuthBaseUrl);
    assert.equal(settings.apiKey, fakeJwt(4_102_444_800));
    assert.deepEqual(buildProviderRequestHeaders(settings), {
      authorization: `Bearer ${fakeJwt(4_102_444_800)}`,
      "chatgpt-account-id": "acct_test",
      "content-type": "application/json",
      originator: "codex_cli_rs",
    });
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("buildProviderRequestBody omits temperature by default for model compatibility", () => {
  const messages = [{ role: "user", content: "hello" }] as const;

  assert.deepEqual(buildProviderRequestBody("chat-completions", "kimi-k2.7-code", messages), {
    model: "kimi-k2.7-code",
    messages,
    stream: true,
  });
  assert.deepEqual(buildProviderRequestBody("responses", "gpt-5.5", messages), {
    model: "gpt-5.5",
    input: messages,
    store: false,
    stream: true,
  });
});

test("buildProviderRequestBody moves system messages into Responses instructions", () => {
  const messages = [
    { role: "system", content: "Be concise." },
    { role: "user", content: "hello" },
  ] as const;

  assert.deepEqual(buildProviderRequestBody("responses", "gpt-5.5", messages), {
    model: "gpt-5.5",
    input: [{ role: "user", content: "hello" }],
    instructions: "Be concise.",
    store: false,
    stream: true,
  });
});

test("buildProviderRequestBody ignores reasoning controls for stable provider compatibility", () => {
  const messages = [{ role: "user", content: "think" }] as const;

  assert.deepEqual(buildProviderRequestBody("responses", "gpt-5.5", messages), {
    model: "gpt-5.5",
    input: messages,
    store: false,
    stream: true,
  });
});

test("buildProviderRequestBody includes native tool schemas when supplied", () => {
  const messages = [{ role: "user", content: "read the readme" }] as const;
  const tools = nativeAgentToolDefinitions(["read", "shell"]);

  const chatBody = buildProviderRequestBody("chat-completions", "gpt-test", messages, tools);
  const responsesBody = buildProviderRequestBody("responses", "gpt-test", messages, tools);

  assert.deepEqual(chatBody["tools"], tools);
  assert.deepEqual(responsesBody["tools"], [
    {
      type: "function",
      name: "read",
      description: "Read a workspace file.",
      parameters: tools[0]?.function.parameters,
    },
    {
      type: "function",
      name: "shell",
      description: "Run an allowlisted shell command.",
      parameters: tools[1]?.function.parameters,
    },
  ]);
  assert.equal(tools[0]?.function.name, "read");
  assert.equal(tools[1]?.function.name, "shell");
});

test("parseOpenAiStreamLine extracts streamed content deltas", () => {
  const event = parseOpenAiStreamLine(
    'data: {"choices":[{"delta":{"content":"hello"}}]}',
  );

  assert.deepEqual(event, { kind: "content", content: "hello" });
});

test("parseOpenAiStreamLine skips null content deltas", () => {
  const event = parseOpenAiStreamLine(
    'data: {"choices":[{"delta":{"content":null}}]}',
  );

  assert.deepEqual(event, { kind: "skip" });
});

test("parseOpenAiStreamLine extracts native chat tool calls", () => {
  const event = parseOpenAiStreamLine(
    'data: {"choices":[{"delta":{"tool_calls":[{"function":{"name":"read","arguments":"{\\"path\\":\\"README.md\\"}"}}]}}]}',
  );

  assert.deepEqual(event, { kind: "tool_call", request: { tool: "read", path: "README.md" } });
});

test("parseOpenAiResponsesLine extracts streamed output text deltas", () => {
  const event = parseOpenAiResponsesLine(
    'data: {"type":"response.output_text.delta","delta":"hello"}',
  );

  assert.deepEqual(event, { kind: "content", content: "hello" });
});

test("parseOpenAiResponsesLine extracts native response tool calls", () => {
  const event = parseOpenAiResponsesLine(
    'data: {"type":"response.output_item.done","item":{"type":"function_call","name":"grep","arguments":"{\\"query\\":\\"TODO\\"}"}}',
  );

  assert.deepEqual(event, { kind: "tool_call", request: { tool: "grep", query: "TODO" } });
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

test("streamEventsFromChunks assembles streamed chat tool call deltas", async () => {
  const events = [];
  const chunks = [
    Buffer.from('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"read","arguments":"{\\"pa"}}]}}]}\n\n'),
    Buffer.from('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"th\\":\\"README.md\\"}"}}]},"finish_reason":"tool_calls"}]}\n\n'),
    Buffer.from("data: [DONE]\n\n"),
  ];

  for await (const event of streamEventsFromChunks(toAsync(chunks))) {
    events.push(event);
  }

  assert.deepEqual(events, [
    { kind: "skip" },
    { kind: "skip" },
    { kind: "tool_call", request: { tool: "read", path: "README.md" } },
    { kind: "skip" },
    { kind: "done" },
    { kind: "skip" },
  ]);
});

test("streamEventsFromChunks emits one chat tool call after finish reason", async () => {
  const events = [];
  const chunks = [
    Buffer.from('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"read","arguments":"{\\"path\\":\\"README.md\\"}"}}]}}]}\n\n'),
    Buffer.from('data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n'),
  ];

  for await (const event of streamEventsFromChunks(toAsync(chunks))) {
    events.push(event);
  }

  assert.deepEqual(events, [
    { kind: "skip" },
    { kind: "skip" },
    { kind: "tool_call", request: { tool: "read", path: "README.md" } },
    { kind: "skip" },
  ]);
});

test("streamChatCompletion retries transient provider HTTP failures", async () => {
  const server = await startChatServer([
    { status: 429, body: "rate limited" },
    { status: 200, body: 'data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n' },
  ]);
  const tokens: string[] = [];
  try {
    await streamChatCompletion({
      selectedModel: {
        provider: "custom-openai",
        model: "test-model",
        tier: "mid",
        reason: "test",
      },
      messages: [{ role: "user", content: "hello" }],
      env: {
        CUSTOM_OPENAI_API_KEY: "secret",
        DREAM_CUSTOM_OPENAI_BASE_URL: server.baseUrl,
      },
      onToken: (token) => {
        tokens.push(token);
      },
    });

    assert.deepEqual(tokens, ["ok"]);
    assert.equal(server.requests(), 2);
  } finally {
    await server.close();
  }
});

async function* toAsync(chunks: readonly Buffer[]): AsyncGenerator<Buffer> {
  for (const chunk of chunks) {
    yield chunk;
  }
}

type ChatResponse = {
  readonly status: number;
  readonly body: string;
};

type ChatServer = {
  readonly baseUrl: string;
  readonly requests: () => number;
  readonly close: () => Promise<void>;
};

function startChatServer(responses: readonly ChatResponse[]): Promise<ChatServer> {
  let requestCount = 0;
  const server = createServer((request, response) => {
    requestCount += 1;
    const next = responses[Math.min(requestCount - 1, responses.length - 1)];
    if (request.url !== "/chat/completions" || next === undefined) {
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("not found");
      return;
    }
    response.writeHead(next.status, { "content-type": "text/event-stream" });
    response.end(next.body);
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      const address = server.address();
      if (!isAddressInfo(address)) {
        reject(new Error("Chat test server did not expose a TCP port."));
        return;
      }
      resolve({
        baseUrl: `http://127.0.0.1:${address.port}`,
        requests: () => requestCount,
        close: () => new Promise((closeResolve, closeReject) => {
          server.close((error) => {
            if (error !== undefined) {
              closeReject(error);
              return;
            }
            closeResolve();
          });
        }),
      });
    });
  });
}

function isAddressInfo(value: string | AddressInfo | null): value is AddressInfo {
  return typeof value === "object" && value !== null && "port" in value;
}

function fakeJwt(exp: number): string {
  const header = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ exp })).toString("base64url");
  return `${header}.${payload}.signature`;
}
