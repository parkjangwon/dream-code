import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { createAgentMessages, runAgentPrompt } from "../src/agent-runner.js";
import { defaultConfig } from "../src/config.js";
import { writeProviderCredential } from "../src/credentials.js";
import type { DreamSkill } from "../src/skills.js";

test("createAgentMessages keeps prompts minimal for token-saving startup", () => {
  const messages = createAgentMessages("fix tests");

  assert.equal(messages.length, 2);
  assert.equal(messages[1]?.role, "user");
  assert.equal(messages[1]?.content, "fix tests");
  assert.match(messages[0]?.content ?? "", /fast coding harness/i);
  assert.match(messages[0]?.content ?? "", /prefer completion over clarification/u);
  assert.match(messages[0]?.content ?? "", /use research before asking the user/u);
  assert.match(messages[0]?.content ?? "", /verify before claiming success/u);
});

test("createAgentMessages injects only explicitly requested skill bodies", () => {
  const skills: readonly DreamSkill[] = [
    {
      name: "review",
      description: "Review code for regressions.",
      body: "Always list findings first.",
      path: "/tmp/review/SKILL.md",
      source: "dream",
    },
    {
      name: "docs",
      description: "Write docs.",
      body: "Unused body.",
      path: "/tmp/docs.md",
      source: "agents",
    },
  ];

  const messages = createAgentMessages("Use @review on this diff", skills);
  const system = messages[0]?.content ?? "";

  assert.match(system, /Available Dream Code skills/u);
  assert.match(system, /review: Review code/u);
  assert.match(system, /Always list findings first/u);
  assert.doesNotMatch(system, /Unused body/u);
});

test("createAgentMessages ignores unknown skill mentions", () => {
  const skills: readonly DreamSkill[] = [
    {
      name: "review",
      description: "Review code for regressions.",
      body: "Always list findings first.",
      path: "/tmp/review/SKILL.md",
      source: "dream",
    },
  ];

  const messages = createAgentMessages("Use @missing on this diff", skills);
  const system = messages[0]?.content ?? "";

  assert.match(system, /none active/u);
  assert.doesNotMatch(system, /Always list findings first/u);
});

test("createAgentMessages injects a selected subagent profile", () => {
  const messages = createAgentMessages("Review this branch", [], {
    id: "code-reviewer",
    name: "Code Reviewer",
    summary: "Review changes for regressions.",
    model: "inherit",
    tools: ["read", "shell"],
    prompt: "Report findings first.",
    source: "built-in",
  });
  const system = messages[0]?.content ?? "";

  assert.match(system, /Active Dream Code subagent/u);
  assert.match(system, /Code Reviewer/u);
  assert.match(system, /Report findings first\./u);
  assert.match(system, /read, shell/u);
});

test("createAgentMessages includes additional workspace directories", () => {
  const messages = createAgentMessages("inspect workspace", [], undefined, undefined, ["/repo/shared"]);
  const system = messages[0]?.content ?? "";

  assert.match(system, /Additional workspace directories/u);
  assert.match(system, /\/repo\/shared/u);
});

test("createAgentMessages injects compact session context", () => {
  const messages = createAgentMessages(
    "continue work",
    [],
    undefined,
    undefined,
    [],
    "MCP servers: none configured.",
    "Session compact:\nPrevious decisions.",
  );
  const system = messages[0]?.content ?? "";

  assert.match(system, /Session compact/u);
  assert.match(system, /Previous decisions/u);
});

test("createAgentMessages places recent session turns before the current prompt", () => {
  const messages = createAgentMessages(
    "continue",
    [],
    undefined,
    undefined,
    [],
    "MCP servers: none configured.",
    "Session compact: none.",
    "Dream memory: none.",
    "/repo",
    [
      { role: "user", content: "Earlier request" },
      { role: "assistant", content: "Earlier answer" },
    ],
  );

  assert.deepEqual(messages.map((message) => message.role), ["system", "user", "assistant", "user"]);
  assert.equal(messages[1]?.content, "Earlier request");
  assert.equal(messages[2]?.content, "Earlier answer");
  assert.equal(messages[3]?.content, "continue");
});

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
