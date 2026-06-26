import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { runAgentPrompt } from "../src/agent-runner.js";
import { bootstrapAutoModelConfig } from "../src/model-auto-bootstrap.js";
import { defaultConfig } from "../src/config.js";
import { writeProviderCredential } from "../src/credentials.js";
import { startSession } from "../src/session-store.js";
import type { AgentSteering } from "../src/agent-steering.js";
test("runAgentPrompt retries the next auto-route candidate when a provider fails", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-agent-failover-"));
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk: Buffer) => {
      body = `${body}${chunk.toString("utf8")}`;
    });
    request.on("end", () => {
      const parsed: unknown = JSON.parse(body);
      const model = modelFromRequest(parsed);
      if (model === "deepseek-v4-flash") {
        response.writeHead(500, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "planned failure" }));
        return;
      }
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.end([
        "data: {\"choices\":[{\"delta\":{\"content\":\"failover ok\"}}]}",
        "",
        "data: [DONE]",
        "",
      ].join("\n"));
    });
  });
  try {
    const baseUrl = await listen(server);
    await writeProviderCredential(root, "deepseek", { apiKey: "sk-deepseek", region: "global", baseUrl });
    await writeProviderCredential(root, "openai", { apiKey: "sk-openai", region: "global", baseUrl });

    const config = defaultConfig();
    const chunks: string[] = [];
    await runAgentPrompt({
      config: {
        ...config,
        model: {
          ...config.model,
          mode: "auto",
          single: {
            provider: "openai",
            models: { low: "gpt-5.4-mini", mid: "gpt-5.5", high: "gpt-5.5" },
            defaultTier: "mid",
          },
          auto: {
            routes: [],
            categories: [
              {
                id: "quick",
                label: "Quick",
                tier: "low",
                match: ["hello"],
                candidates: ["deepseek/deepseek-v4-flash", "openai/gpt-5.4-mini"],
              },
            ],
            agentRoutes: [],
            preferConnectedProviders: true,
          },
        },
      },
      configRoot: root,
      prompt: "hello",
      cwd: "/repo",
      write: (chunk) => {
        chunks.push(chunk);
      },
    });

    const output = chunks.join("");
    assert.match(output, /model failover/u);
    assert.match(output, /failover ok/u);
  } finally {
    server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("runAgentPrompt can collect tokens without rendering response chrome", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-agent-silent-"));
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.end([
      "data: {\"choices\":[{\"delta\":{\"content\":\"silent output\"}}]}",
      "",
      "data: [DONE]",
      "",
    ].join("\n"));
  });
  try {
    const baseUrl = await listen(server);
    await writeProviderCredential(root, "openai", { apiKey: "sk-openai", region: "global", baseUrl });
    const chunks: string[] = [];

    await runAgentPrompt({
      config: defaultConfig(),
      configRoot: root,
      prompt: "hello",
      cwd: "/repo",
      renderResponse: false,
      write: (chunk) => {
        chunks.push(chunk);
      },
    });

    assert.equal(chunks.join(""), "");
  } finally {
    server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("runAgentPrompt injects steering instructions before model calls", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-agent-steering-"));
  let requestBody = "";
  const server = createServer((request, response) => {
    request.on("data", (chunk: Buffer) => {
      requestBody = `${requestBody}${chunk.toString("utf8")}`;
    });
    request.on("end", () => {
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.end([
        "data: {\"choices\":[{\"delta\":{\"content\":\"steered\"}}]}",
        "",
        "data: [DONE]",
        "",
      ].join("\n"));
    });
  });
  try {
    const baseUrl = await listen(server);
    await writeProviderCredential(root, "openai", { apiKey: "sk-openai", region: "global", baseUrl });

    await runAgentPrompt({
      config: defaultConfig(),
      configRoot: root,
      prompt: "start",
      cwd: "/repo",
      renderResponse: false,
      steering: {
        drain: () => ["prefer tests before edits"],
      },
      write: () => {},
    });

    assert.match(requestBody, /Live steering instructions were submitted/u);
    assert.match(requestBody, /prefer tests before edits/u);
  } finally {
    server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("runAgentPrompt interrupts an active model stream when steering arrives", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-agent-steering-interrupt-"));
  const steering = createTestSteering();
  const requestBodies: string[] = [];
  let requestCount = 0;
  const server = createServer((request, response) => {
    const requestIndex = requestCount + 1;
    requestCount = requestIndex;
    let body = "";
    request.on("data", (chunk: Buffer) => {
      body = `${body}${chunk.toString("utf8")}`;
    });
    request.on("end", () => {
      requestBodies.push(body);
      response.writeHead(200, { "content-type": "text/event-stream" });
      if (requestIndex === 1) {
        response.write("data: {\"choices\":[{\"delta\":{\"content\":\"old partial\"}}]}\n\n");
        steering.pushSteer("stop the current analysis and focus on tests");
        return;
      }
      response.end([
        "data: {\"choices\":[{\"delta\":{\"content\":\"steered final\"}}]}",
        "",
        "data: [DONE]",
        "",
      ].join("\n"));
    });
  });
  try {
    const baseUrl = await listen(server);
    await writeProviderCredential(root, "openai", { apiKey: "sk-openai", region: "global", baseUrl });

    const result = await runAgentPrompt({
      config: defaultConfig(),
      configRoot: root,
      prompt: "start",
      cwd: "/repo",
      renderResponse: false,
      steering,
      write: () => {},
    });

    assert.equal(result, "steered final");
    assert.equal(requestCount, 2);
    assert.doesNotMatch(requestBodies[0] ?? "", /focus on tests/u);
    assert.match(requestBodies[1] ?? "", /Live steering instructions were submitted/u);
    assert.match(requestBodies[1] ?? "", /focus on tests/u);
  } finally {
    server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("runAgentPrompt keeps the previous hard model for related session follow-up", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-agent-sticky-routing-"));
  const requestedModels: string[] = [];
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk: Buffer) => {
      body = `${body}${chunk.toString("utf8")}`;
    });
    request.on("end", () => {
      requestedModels.push(modelFromRequest(JSON.parse(body)));
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.end([
        "data: {\"choices\":[{\"delta\":{\"content\":\"ok\"}}]}",
        "",
        "data: [DONE]",
        "",
      ].join("\n"));
    });
  });
  try {
    const baseUrl = await listen(server);
    await writeProviderCredential(root, "deepseek", { apiKey: "sk-deepseek", region: "global", baseUrl });
    await writeProviderCredential(root, "openrouter", { apiKey: "sk-openrouter", region: "global", baseUrl });
    const config = bootstrapAutoModelConfig(defaultConfig(), new Set(["deepseek", "openrouter"]));
    const session = await startSession(root, "/repo");

    await runAgentPrompt({
      config,
      configRoot: root,
      prompt: "Use rg to inspect files, then design the architecture migration algorithm",
      cwd: "/repo",
      sessionId: session.id,
      renderResponse: false,
      write: () => {},
    });
    await runAgentPrompt({
      config,
      configRoot: root,
      prompt: "Continue the implementation and update the tests",
      cwd: "/repo",
      sessionId: session.id,
      renderResponse: false,
      write: () => {},
    });

    assert.deepEqual(requestedModels, ["z-ai/glm-5.2", "z-ai/glm-5.2"]);
  } finally {
    server.close();
    await rm(root, { recursive: true, force: true });
  }
});

function modelFromRequest(value: unknown): string {
  if (typeof value !== "object" || value === null || !("model" in value)) {
    return "";
  }
  const model = value.model;
  return typeof model === "string" ? model : "";
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

type TestSteering = AgentSteering & {
  readonly pushSteer: (text: string) => void;
};

function createTestSteering(): TestSteering {
  let pending: readonly string[] = [];
  let controller = new AbortController();
  let streamActive = false;
  let interrupted = false;
  return {
    drain: () => {
      const current = pending;
      pending = [];
      return current;
    },
    streamSignal: () => {
      streamActive = true;
      return controller.signal;
    },
    finishStream: () => {
      streamActive = false;
    },
    consumeInterrupt: () => {
      const current = interrupted;
      interrupted = false;
      return current;
    },
    pushSteer: (text) => {
      pending = [...pending, text];
      if (streamActive) {
        interrupted = true;
        controller.abort();
        controller = new AbortController();
      }
    },
  };
}
