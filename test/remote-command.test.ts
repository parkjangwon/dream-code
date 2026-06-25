import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { writeProviderCredential } from "../src/credentials.js";
import { RemoteCommandError, runRemoteCommand } from "../src/remote-command.js";
import { listSessions } from "../src/session-store.js";

test("runRemoteCommand streams only the assistant answer for normal prompts", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-remote-agent-"));
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.end([
      "data: {\"choices\":[{\"delta\":{\"content\":\"remote answer\"}}]}",
      "",
      "data: [DONE]",
      "",
    ].join("\n"));
  });
  try {
    const baseUrl = await listen(server);
    await writeProviderCredential(root, "openai", { apiKey: "sk-openai", region: "global", baseUrl });
    const chunks: string[] = [];
    const activity: string[] = [];
    let sessionId = "";
    const result = await runRemoteCommand({
      configRoot: root,
      prompt: "hello remote",
      cwd: "/tmp/dream-code",
      onActivity: (event) => activity.push(event.label),
      onChunk: (chunk) => chunks.push(chunk),
      onSession: (id) => {
        sessionId = id;
      },
    });
    const [session] = await listSessions(root);

    assert.equal(result.output, "remote answer");
    assert.deepEqual(chunks, ["remote answer"]);
    assert.deepEqual(activity, ["Loading session", "Loading config", "Recording prompt", "Running agent", "Finalizing answer"]);
    assert.equal(sessionId, result.sessionId);
    assert.equal(session?.turns[0]?.content, "hello remote");
    assert.equal(session?.turns[1]?.content, "remote answer");
  } finally {
    server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("runRemoteCommand reports agent tool progress as remote activity", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-remote-tool-"));
  const project = await mkdtemp(join(tmpdir(), "dream-remote-tool-project-"));
  let calls = 0;
  const server = createServer((_request, response) => {
    calls += 1;
    response.writeHead(200, { "content-type": "text/event-stream" });
    const content = calls === 1
      ? "```dream-tool\n{\"tool\":\"list\",\"path\":\".\"}\n```"
      : "tool loop complete";
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
    const activity: { readonly label: string; readonly detail?: string }[] = [];

    const result = await runRemoteCommand({
      configRoot: root,
      prompt: "inspect project",
      cwd: project,
      onActivity: (event) => activity.push(event),
    });

    assert.equal(result.output, "tool loop complete");
    assert.equal(calls, 2);
    assert.ok(activity.some((event) => event.label === "Listed ." && event.detail === "Inspecting workspace entries"));
  } finally {
    server.close();
    await rm(project, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  }
});

test("runRemoteCommand rejects interactive-only slash commands", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-remote-slash-"));
  try {
    await assert.rejects(
      () => runRemoteCommand({
        configRoot: root,
        prompt: "/agents",
        cwd: "/tmp/dream-code",
      }),
      (error: unknown) => error instanceof RemoteCommandError && /not available in Dream Remote/u.test(error.message),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runRemoteCommand allows remote-safe slash commands", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-remote-status-"));
  try {
    const chunks: string[] = [];
    const result = await runRemoteCommand({
      configRoot: root,
      prompt: "/status",
      cwd: "/tmp/dream-code",
      onChunk: (chunk) => chunks.push(chunk),
    });

    assert.match(result.output, /Status/u);
    assert.equal(chunks.join(""), result.output);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function listen(server: Server): Promise<string> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("Server did not bind to a TCP port."));
        return;
      }
      resolve(`http://127.0.0.1:${address.port}/v1`);
    });
  });
}
