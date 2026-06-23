import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runAgentPrompt } from "../src/agent-runner.js";
import { defaultConfig } from "../src/config.js";
import { writeProviderCredential } from "../src/credentials.js";
import { appendSessionTurn, startSession } from "../src/session-store.js";

test("runAgentPrompt sends recent session turns to the provider", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-agent-session-context-"));
  const receivedMessages: Array<readonly WireMessage[]> = [];
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk: Buffer) => {
      body = `${body}${chunk.toString("utf8")}`;
    });
    request.on("end", () => {
      receivedMessages.push(messagesFromRequest(JSON.parse(body)));
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.end([
        "data: {\"choices\":[{\"delta\":{\"content\":\"context ok\"}}]}",
        "",
        "data: [DONE]",
        "",
      ].join("\n"));
    });
  });
  try {
    const baseUrl = await listen(server);
    await writeProviderCredential(root, "openai", { apiKey: "sk-openai", region: "global", baseUrl });
    const session = await startSession(root, "/repo");
    await appendSessionTurn(root, session.id, "user", "Remember the release flow.");
    await appendSessionTurn(root, session.id, "assistant", "I will test, tag, and verify.");
    await appendSessionTurn(root, session.id, "user", "Continue.");

    await runAgentPrompt({
      config: defaultConfig(),
      configRoot: root,
      prompt: "Continue.",
      cwd: "/repo",
      sessionId: session.id,
      renderResponse: false,
      write: () => {},
    });

    const messages = receivedMessages[0] ?? [];
    assert.deepEqual(messages.map((message) => message.role), ["system", "user", "user"]);
    assert.match(messages[0]?.content ?? "", /Model routing context/u);
    assert.match(messages[0]?.content ?? "", /full transcript/u);
    assert.match(messages[1]?.content ?? "", /<session-context>/u);
    assert.match(messages[1]?.content ?? "", /Remember the release flow/u);
    assert.match(messages[1]?.content ?? "", /I will test, tag, and verify/u);
    assert.equal(messages[2]?.content, "Continue.");
  } finally {
    server.close();
    await rm(root, { recursive: true, force: true });
  }
});

type WireMessage = {
  readonly role: string;
  readonly content: string;
};

function messagesFromRequest(value: unknown): readonly WireMessage[] {
  if (typeof value !== "object" || value === null || !("messages" in value) || !Array.isArray(value.messages)) {
    return [];
  }
  return value.messages.filter(isWireMessage);
}

function isWireMessage(value: unknown): value is WireMessage {
  if (typeof value !== "object" || value === null || !("role" in value) || !("content" in value)) {
    return false;
  }
  return typeof value.role === "string" && typeof value.content === "string";
}

function listen(server: ReturnType<typeof createServer>): Promise<string> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("Could not bind test server"));
        return;
      }
      resolve(`http://127.0.0.1:${address.port}/v1`);
    });
  });
}
