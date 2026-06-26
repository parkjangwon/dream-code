import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { request } from "undici";

import { startRemoteServer } from "../src/remote-server.js";

test("remote web serves the browser shell and pwa resources over http", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-remote-web-e2e-"));
  const project = await mkdtemp(join(tmpdir(), "dream-remote-web-e2e-project-"));
  const server = await startRemoteServer({
    configRoot: root,
    bindHost: "127.0.0.1",
    port: 0,
    pairingCode: "112233",
    unsafeAllowNonTailscale: true,
    workspaceRoot: project,
    commandRunner: async () => ({ sessionId: "web-e2e-session", output: "web e2e done", shouldContinue: true }),
  });
  try {
    const shell = await request(`${server.origin}/`);
    assert.equal(shell.statusCode, 200);
    assert.match(String(shell.headers["content-type"]), /text\/html/u);
    const shellBody = await shell.body.text();
    assert.match(shellBody, /<div id="app"><\/div>/u);
    assert.match(shellBody, /serviceWorker\.register/u);
    assert.match(shellBody, /new EventSource\("\/api\/events"\)/u);

    const manifest = await request(`${server.origin}/manifest.webmanifest`);
    assert.equal(manifest.statusCode, 200);
    assert.match(String(manifest.headers["content-type"]), /application\/manifest\+json/u);
    const manifestBody = await manifest.body.json() as { readonly start_url?: string; readonly display?: string };
    assert.equal(manifestBody.start_url, "/");
    assert.equal(manifestBody.display, "standalone");

    const worker = await request(`${server.origin}/sw.js`);
    assert.equal(worker.statusCode, 200);
    assert.match(await worker.body.text(), /CACHE_NAME = 'dream-remote-v4'/u);
  } finally {
    await server.close();
    await rm(project, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  }
});

test("remote web cookie flow pairs, opens events, and submits with csrf", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-remote-web-e2e-"));
  const project = await mkdtemp(join(tmpdir(), "dream-remote-web-e2e-project-"));
  const server = await startRemoteServer({
    configRoot: root,
    bindHost: "127.0.0.1",
    port: 0,
    pairingCode: "112233",
    unsafeAllowNonTailscale: true,
    workspaceRoot: project,
    commandRunner: async () => ({ sessionId: "web-e2e-session", output: "web e2e done", shouldContinue: true }),
  });
  try {
    const pair = await request(`${server.origin}/api/pair`, {
      method: "POST",
      body: JSON.stringify({ code: "112233", deviceName: "mobile browser" }),
      headers: { "content-type": "application/json", origin: server.origin },
    });
    assert.equal(pair.statusCode, 200);
    const cookie = cookieHeader(pair.headers["set-cookie"]);
    const pairBody = await pair.body.json() as { readonly token?: string; readonly device?: { readonly name?: string } };
    assert.equal(pairBody.token, undefined);
    assert.equal(pairBody.device?.name, "mobile browser");

    const me = await request(`${server.origin}/api/me`, { headers: { cookie } });
    assert.equal(me.statusCode, 200);
    const meBody = await me.body.json() as { readonly device?: { readonly name?: string } };
    assert.equal(meBody.device?.name, "mobile browser");

    const events = await request(`${server.origin}/api/events`, { headers: { cookie } });
    assert.equal(events.statusCode, 200);
    assert.match(String(events.headers["content-type"]), /text\/event-stream/u);

    const submitted = await request(`${server.origin}/api/commands`, {
      method: "POST",
      body: JSON.stringify({ prompt: "/status", cwd: project }),
      headers: { cookie, "content-type": "application/json", origin: server.origin, "x-dream-remote-csrf": "1" },
    });
    assert.equal(submitted.statusCode, 202);
    events.body.destroy();
  } finally {
    await server.close();
    await rm(project, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  }
});

function cookieHeader(value: string | readonly string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  assert.equal(typeof raw, "string");
  return raw.split(";")[0] ?? "";
}
