import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { AgentDefinition } from "../src/agent-library.js";
import { defaultConfig } from "../src/config.js";
import { writeProviderCredential } from "../src/credentials.js";
import { defaultSwarmAgentRunner } from "../src/swarm-agent-runner.js";

test("defaultSwarmAgentRunner returns silent model text without response chrome", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-swarm-runner-"));
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.end([
      "data: {\"choices\":[{\"delta\":{\"content\":\"merged lane answer\"}}]}",
      "",
      "data: [DONE]",
      "",
    ].join("\n"));
  });
  try {
    const baseUrl = await listen(server);
    await writeProviderCredential(root, "openai", { apiKey: "sk-openai", region: "global", baseUrl });
    const reports: number[] = [];
    const chunks: string[] = [];
    const runner = defaultSwarmAgentRunner({
      config: defaultConfig(),
      configRoot: root,
      cwd: "/repo",
      goal: "merge",
      write: (chunk) => {
        chunks.push(chunk);
      },
    });

    const output = await runner({
      kind: "lane",
      lane: { id: "lane-1", title: "Tech Lead", agent: testAgent, prompt: "work" },
      agent: testAgent,
      prompt: "work",
      signal: new AbortController().signal,
      report: (progress) => {
        reports.push(progress.characters);
      },
    });

    assert.equal(output, "merged lane answer");
    assert.deepEqual(chunks, []);
    assert.deepEqual(reports, ["merged lane answer".length]);
  } finally {
    server.close();
    await rm(root, { recursive: true, force: true });
  }
});

const testAgent: AgentDefinition = {
  id: "tech-lead",
  name: "Tech Lead",
  summary: "Plan.",
  model: "inherit",
  tools: ["read"],
  prompt: "Plan.",
  source: "built-in",
};

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
