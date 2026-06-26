import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { request } from "undici";

import { startRemoteServer } from "../src/remote-server.js";
import { pairToken, waitForCommandStatus } from "./remote-server-test-helpers.js";

test("remote server submits commands into an existing session", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-remote-session-command-"));
  const project = await mkdtemp(join(tmpdir(), "dream-remote-session-command-project-"));
  let receivedSessionId = "";
  const server = await startRemoteServer({
    configRoot: root,
    bindHost: "127.0.0.1",
    port: 0,
    pairingCode: "333333",
    unsafeAllowNonTailscale: true,
    workspaceRoot: project,
    commandRunner: async (input) => {
      receivedSessionId = input.sessionId ?? "";
      return { sessionId: receivedSessionId, output: "continued", shouldContinue: true };
    },
  });
  try {
    const token = await pairToken(server.origin, "333333");
    const sessionId = "session-existing";
    const submitted = await request(`${server.origin}/api/commands`, {
      method: "POST",
      body: JSON.stringify({ prompt: "continue", cwd: project, sessionId }),
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    });

    assert.equal(submitted.statusCode, 202);
    const body = await submitted.body.json() as { readonly command: { readonly id: string } };
    await waitForCommandStatus(server.origin, token, body.command.id, "done");
    assert.equal(receivedSessionId, sessionId);
  } finally {
    await server.close();
    await rm(project, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  }
});

test("remote server keeps uploaded files only while the command runs", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-remote-upload-"));
  const project = await mkdtemp(join(tmpdir(), "dream-remote-upload-project-"));
  let uploadedPath = "";
  const server = await startRemoteServer({
    configRoot: root,
    bindHost: "127.0.0.1",
    port: 0,
    pairingCode: "121314",
    unsafeAllowNonTailscale: true,
    workspaceRoot: project,
    commandRunner: async (input) => {
      const match = /^- hello remote\.txt: (.+)$/mu.exec(input.prompt);
      assert.notEqual(match, null);
      uploadedPath = match?.[1] ?? "";
      assert.equal(await readFile(uploadedPath, "utf8"), "hello remote");
      return { sessionId: "session-upload", output: "saw upload", shouldContinue: true };
    },
  });
  try {
    const token = await pairToken(server.origin, "121314");
    const submitted = await request(`${server.origin}/api/commands`, {
      method: "POST",
      body: JSON.stringify({
        prompt: "inspect uploaded file",
        cwd: project,
        uploads: [{ dataBase64: Buffer.from("hello remote").toString("base64"), name: "../hello remote.txt", type: "text/plain" }],
      }),
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    });
    assert.equal(submitted.statusCode, 202);
    const body = await submitted.body.json() as { readonly command: { readonly id: string; readonly prompt: string } };

    assert.equal(body.command.prompt, "inspect uploaded file");
    await waitForCommandStatus(server.origin, token, body.command.id, "done");
    assert.match(uploadedPath, /\.dream\/remote-uploads\/[0-9A-Za-z]+-1-hello-remote\.txt$/u);
    await assert.rejects(() => readFile(uploadedPath, "utf8"), /ENOENT/u);
  } finally {
    await server.close();
    await rm(project, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  }
});
