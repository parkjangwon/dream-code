import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { runAgentPrompt } from "../src/agent-runner.js";
import { defaultConfig } from "../src/config.js";
import { writeProviderCredential } from "../src/credentials.js";

test("runAgentPrompt continues tool loops beyond small prototype limits", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-agent-tool-loop-"));
  let calls = 0;
  const server = createServer((_request, response) => {
    calls += 1;
    response.writeHead(200, { "content-type": "text/event-stream" });
    const content = calls <= 5
      ? `\`\`\`dream-tool\n{"tool":"list","path":"."}\n\`\`\``
      : "loop complete";
    response.end([
      `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}`,
      "",
      "data: [DONE]",
      "",
    ].join("\n"));
  });
  try {
    const baseUrl = await listen(server);
    await writeProviderCredential(root, "openai", { apiKey: "sk-openai", region: "global", baseUrl });

    await runAgentPrompt({
      config: defaultConfig(),
      configRoot: root,
      prompt: "inspect until done",
      cwd: "/tmp",
      renderResponse: false,
      write: () => {},
    });

    assert.equal(calls, 6);
  } finally {
    server.close();
    await rm(root, { recursive: true, force: true });
  }
});

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
