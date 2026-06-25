import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { defaultConfig } from "../src/config.js";
import { writeProviderCredential } from "../src/credentials.js";
import { runPromptCommand } from "../src/cli-prompt.js";

test("runPromptCommand prints the final assistant text without opening the TUI", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-cli-prompt-"));
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.end([
      "data: {\"choices\":[{\"delta\":{\"content\":\"prompt mode ok\"}}]}",
      "",
      "data: [DONE]",
      "",
    ].join("\n"));
  });
  try {
    const baseUrl = await listen(server);
    await writeProviderCredential(root, "openai", { apiKey: "sk-openai", region: "global", baseUrl });
    const output: string[] = [];
    const errorOutput: string[] = [];

    await runPromptCommand({
      config: defaultConfig(),
      configRoot: root,
      prompt: "hello from outside",
      cwd: "/repo",
      write: (text) => {
        output.push(text);
      },
      writeError: (text) => {
        errorOutput.push(text);
      },
    });

    assert.equal(output.join(""), "prompt mode ok\n");
    assert.equal(errorOutput.join(""), "");
  } finally {
    server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("runPromptCommand renders markdown in plain CLI output", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-cli-prompt-markdown-"));
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.end([
      "data: {\"choices\":[{\"delta\":{\"content\":\"# Result\\n- **fixed** `src/app.ts`\"}}]}",
      "",
      "data: [DONE]",
      "",
    ].join("\n"));
  });
  try {
    const baseUrl = await listen(server);
    await writeProviderCredential(root, "openai", { apiKey: "sk-openai", region: "global", baseUrl });
    const output: string[] = [];

    await runPromptCommand({
      config: defaultConfig(),
      configRoot: root,
      prompt: "hello from outside",
      cwd: "/repo",
      write: (text) => {
        output.push(text);
      },
      writeError: () => {},
    });

    const rendered = output.join("");
    assert.doesNotMatch(rendered, /^# Result/mu);
    assert.doesNotMatch(rendered, /\*\*fixed\*\*/u);
    assert.match(rendered, /Result/u);
    assert.match(rendered, /•/u);
    assert.match(rendered, /src\/app\.ts/u);
  } finally {
    server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("runPromptCommand can emit json and run dreaming after completion", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-cli-prompt-json-"));
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.end([
      "data: {\"choices\":[{\"delta\":{\"content\":\"json mode ok\"}}]}",
      "",
      "data: [DONE]",
      "",
    ].join("\n"));
  });
  try {
    const baseUrl = await listen(server);
    await writeProviderCredential(root, "openai", { apiKey: "sk-openai", region: "global", baseUrl });
    const output: string[] = [];

    await runPromptCommand({
      config: defaultConfig(),
      configRoot: root,
      prompt: "remember this release flow",
      cwd: "/repo",
      json: true,
      quiet: true,
      summarizer: async () => [{
        kind: "workflow-recipe",
        title: "Prompt mode release flow",
        body: "Use prompt mode for scripted Dream Code invocations.",
      }],
      write: (text) => {
        output.push(text);
      },
      writeError: () => {},
    });

    const parsed = JSON.parse(output.join(""));
    assert.equal(parsed.response, "json mode ok");
    assert.equal(parsed.dreaming.added, 1);
  } finally {
    server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("dream -p runs end-to-end through the compiled CLI", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-cli-prompt-e2e-"));
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk: Buffer) => {
      body = `${body}${chunk.toString("utf8")}`;
    });
    request.on("end", () => {
      const content = body.includes("hidden Dreaming memory consolidator")
        ? "{\"memories\":[]}"
        : "compiled cli e2e ok";
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.end([
        `data: {\"choices\":[{\"delta\":{\"content\":${JSON.stringify(content)}}}]}`,
        "",
        "data: [DONE]",
        "",
      ].join("\n"));
    });
  });
  try {
    const baseUrl = await listen(server);
    await writeProviderCredential(root, "openai", { apiKey: "sk-openai", region: "global", baseUrl });

    const result = await runDreamCli(["-p", "hello from compiled cli", "--json", "--quiet"], {
      ...process.env,
      DREAM_CODE_HOME: root,
    });

    assert.equal(result.code, 0);
    assert.equal(result.stderr, "");
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.response, "compiled cli e2e ok");
    assert.equal(parsed.dreaming.reason, "no-memories");
  } finally {
    server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("dream -p blocks shell metacharacter tool calls through the compiled CLI", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-cli-prompt-shell-e2e-"));
  let requests = 0;
  let agentRequests = 0;
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk: Buffer) => {
      body = `${body}${chunk.toString("utf8")}`;
    });
    request.on("end", () => {
      requests += 1;
      const isDreaming = body.includes("hidden Dreaming memory consolidator");
      if (!isDreaming) {
        agentRequests += 1;
      }
      const content = isDreaming
        ? "{\"memories\":[]}"
        : agentRequests === 1
        ? "```dream-tool\n{\"tool_calls\":[{\"tool\":\"shell\",\"command\":\"echo ok && echo bad\"}]}\n```"
        : "shell policy e2e ok";
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.end([
        `data: {\"choices\":[{\"delta\":{\"content\":${JSON.stringify(content)}}}]}`,
        "",
        "data: [DONE]",
        "",
      ].join("\n"));
    });
  });
  try {
    const baseUrl = await listen(server);
    await writeProviderCredential(root, "openai", { apiKey: "sk-openai", region: "global", baseUrl });

    const result = await runDreamCli(["--yolo", "-p", "try shell policy", "--json", "--quiet"], {
      ...process.env,
      DREAM_CODE_HOME: root,
    });

    assert.equal(result.code, 0);
    assert.equal(result.stderr, "");
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.response, "shell policy e2e ok");
    assert.equal(agentRequests, 2);
    assert.equal(requests, 3);
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

function runDreamCli(
  args: readonly string[],
  env: NodeJS.ProcessEnv,
): Promise<{ readonly code: number; readonly stdout: string; readonly stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["dist/src/cli.js", ...args], {
      cwd: process.cwd(),
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout = `${stdout}${chunk.toString("utf8")}`;
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString("utf8")}`;
    });
    child.once("error", reject);
    child.once("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}
