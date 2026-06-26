import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { request } from "undici";

import { startRemoteServer } from "../src/remote-server.js";
import { cookieHeader, pairToken } from "./remote-server-test-helpers.js";

test("remote server authenticates browser requests with an HttpOnly cookie", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-remote-cookie-auth-"));
  const project = await mkdtemp(join(tmpdir(), "dream-remote-cookie-project-"));
  const server = await startRemoteServer({
    configRoot: root,
    bindHost: "127.0.0.1",
    port: 0,
    pairingCode: "232323",
    unsafeAllowNonTailscale: true,
    workspaceRoot: project,
    commandRunner: async () => ({ sessionId: "session-cookie", output: "cookie", shouldContinue: true }),
  });
  try {
    const pair = await request(`${server.origin}/api/pair`, {
      method: "POST",
      body: JSON.stringify({ code: "232323", deviceName: "browser" }),
      headers: { "content-type": "application/json" },
    });
    assert.equal(pair.statusCode, 200);
    const pairBody = await pair.body.json() as { readonly token?: string };
    assert.equal(pairBody.token, undefined);
    const setCookie = cookieHeader(pair.headers["set-cookie"]);
    assert.match(setCookie, /dream_remote_token=/u);
    assert.match(setCookie, /HttpOnly/u);
    assert.match(setCookie, /SameSite=Strict/u);

    const me = await request(`${server.origin}/api/me`, {
      headers: { cookie: setCookie },
    });
    assert.equal(me.statusCode, 200);
    assert.match(await me.body.text(), /browser/u);

    const events = await request(`${server.origin}/api/events`, {
      headers: { cookie: setCookie },
    });
    assert.equal(events.statusCode, 200);
    events.body.destroy();

    const logout = await request(`${server.origin}/api/logout`, {
      method: "POST",
      headers: { cookie: setCookie, origin: server.origin, "x-dream-remote-csrf": "1" },
    });
    assert.equal(logout.statusCode, 200);
    assert.match(cookieHeader(logout.headers["set-cookie"]), /Max-Age=0/u);
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("remote server requires csrf headers for cookie authenticated mutations", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-remote-csrf-"));
  const project = await mkdtemp(join(tmpdir(), "dream-remote-csrf-project-"));
  const server = await startRemoteServer({
    configRoot: root,
    bindHost: "127.0.0.1",
    port: 0,
    pairingCode: "545454",
    unsafeAllowNonTailscale: true,
    workspaceRoot: project,
    commandRunner: async () => ({ sessionId: "session-csrf", output: "csrf", shouldContinue: true }),
  });
  try {
    const pair = await request(`${server.origin}/api/pair`, {
      method: "POST",
      body: JSON.stringify({ code: "545454", deviceName: "browser" }),
      headers: { "content-type": "application/json" },
    });
    assert.equal(pair.statusCode, 200);
    const cookie = cookieHeader(pair.headers["set-cookie"]);

    const rejected = await request(`${server.origin}/api/commands`, {
      method: "POST",
      body: JSON.stringify({ prompt: "/status", cwd: project }),
      headers: { cookie, "content-type": "application/json", origin: "https://evil.example" },
    });
    assert.equal(rejected.statusCode, 403);
    assert.match(await rejected.body.text(), /CSRF/u);

    const accepted = await request(`${server.origin}/api/commands`, {
      method: "POST",
      body: JSON.stringify({ prompt: "/status", cwd: project }),
      headers: { cookie, "content-type": "application/json", origin: server.origin, "x-dream-remote-csrf": "1" },
    });
    assert.equal(accepted.statusCode, 202);
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("remote server rejects event stream tokens in query strings", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-remote-events-query-"));
  const server = await startRemoteServer({
    configRoot: root,
    bindHost: "127.0.0.1",
    port: 0,
    pairingCode: "656565",
    unsafeAllowNonTailscale: true,
  });
  try {
    const token = await pairToken(server.origin, "656565");
    const rejected = await request(`${server.origin}/api/events?token=${encodeURIComponent(token)}`);

    assert.equal(rejected.statusCode, 401);
    assert.match(await rejected.body.text(), /Unauthorized/u);
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});
