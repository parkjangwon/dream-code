import test from "node:test";
import assert from "node:assert/strict";

import {
  buildProviderRequestHeaders,
  buildProviderRequestBody,
  parseOpenAiResponsesLine,
  parseOpenAiStreamLine,
  resolveProviderSettingsForRequest,
  resolveProviderSettings,
  streamEventsFromChunks,
} from "../src/llm-provider.js";
import { codexAuthFilePath, codexOAuthBaseUrl } from "../src/codex-oauth.js";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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

function fakeJwt(exp: number): string {
  const header = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ exp })).toString("base64url");
  return `${header}.${payload}.signature`;
}
