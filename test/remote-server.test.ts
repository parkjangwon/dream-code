import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { request } from "undici";

import { startAgentRun } from "../src/agent-run-store.js";
import { startRemoteServer } from "../src/remote-server.js";
import { appendSessionTurn, startSession } from "../src/session-store.js";
import { addWorkspaceDir } from "../src/workspace-state.js";

test("remote server pairs a device and serves authenticated project session run state", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-remote-server-"));
  const project = await mkdtemp(join(tmpdir(), "dream-remote-project-"));
  const staleProject = await mkdtemp(join(tmpdir(), "dream-remote-stale-"));
  const server = await startRemoteServer({
    configRoot: root,
    bindHost: "127.0.0.1",
    port: 0,
    pairingCode: "123456",
    unsafeAllowNonTailscale: true,
    workspaceRoot: project,
  });
  try {
    await addWorkspaceDir(root, project, project);
    await addWorkspaceDir(root, staleProject, project);
    await rm(staleProject, { recursive: true, force: true });
    const run = await startAgentRun(root, {
      id: "run-remote",
      kind: "agent",
      agentId: "dream",
      agentName: "Dream",
      prompt: "/swarm inspect",
    });
    run.write("Working");
    await run.finish("done");

    const pair = await request(`${server.origin}/api/pair`, {
      method: "POST",
      body: JSON.stringify({ code: "123456", deviceName: "android phone" }),
      headers: { "content-type": "application/json", "x-dream-remote-token-response": "body" },
    });
    assert.equal(pair.statusCode, 200);
    const paired = await pair.body.json() as { readonly token?: string };
    assert.equal(typeof paired.token, "string");
    const token = paired.token ?? "";

    const me = await request(`${server.origin}/api/me`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(me.statusCode, 200);
    assert.match(await me.body.text(), /android phone/u);

    const manifest = await request(`${server.origin}/manifest.webmanifest`);
    assert.equal(manifest.statusCode, 200);
    assert.equal(manifest.headers["content-type"], "application/manifest+json; charset=utf-8");
    const manifestText = await manifest.body.text();
    assert.match(manifestText, /Dream Code/u);
    assert.match(manifestText, /\/icon-192\.png\?v=4/u);
    assert.match(manifestText, /\/icon-512\.png\?v=4/u);
    assert.match(manifestText, /\/maskable-icon\.png\?v=4/u);

    const serviceWorker = await request(`${server.origin}/sw.js`);
    assert.equal(serviceWorker.statusCode, 200);
    assert.equal(serviceWorker.headers["content-type"], "text/javascript; charset=utf-8");
    const serviceWorkerText = await serviceWorker.body.text();
    assert.match(serviceWorkerText, /dream-remote-v4/u);
    assert.match(serviceWorkerText, /clients\.claim/u);
    assert.match(serviceWorkerText, /addEventListener\('fetch'/u);
    assert.match(serviceWorkerText, /notificationclick/u);
    assert.match(serviceWorkerText, /dream-notification-click/u);
    assert.match(serviceWorkerText, /openWindow\(url\)/u);

    const icon = await request(`${server.origin}/icon.svg`);
    assert.equal(icon.statusCode, 200);
    assert.equal(icon.headers["content-type"], "image/svg+xml; charset=utf-8");
    const iconText = await icon.body.text();
    assert.match(iconText, /Dream Code/u);
    assert.match(iconText, /stroke="#000000"/u);
    assert.doesNotMatch(iconText, /#60d394/u);

    const installIcon = await request(`${server.origin}/icon-192.svg`);
    assert.equal(installIcon.statusCode, 200);
    assert.equal(installIcon.headers["content-type"], "image/svg+xml; charset=utf-8");

    const installPng = await request(`${server.origin}/icon-192.png`);
    assert.equal(installPng.statusCode, 200);
    assert.equal(installPng.headers["content-type"], "image/png");
    assert.equal(installPng.headers["cache-control"], "no-cache");
    assert.match((await installPng.body.arrayBuffer()).byteLength.toString(), /\d+/u);

    const maskablePng = await request(`${server.origin}/maskable-icon.png`, { method: "HEAD" });
    assert.equal(maskablePng.statusCode, 200);
    assert.equal(maskablePng.headers["content-type"], "image/png");

    const faviconHead = await request(`${server.origin}/favicon.ico`, { method: "HEAD" });
    assert.equal(faviconHead.statusCode, 200);
    assert.equal(faviconHead.headers["content-type"], "image/png");

    const projects = await request(`${server.origin}/api/projects`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(projects.statusCode, 200);
    const projectText = await projects.body.text();
    assert.match(projectText, /dream-remote-project/u);
    assert.doesNotMatch(projectText, /dream-remote-stale/u);

    const runs = await request(`${server.origin}/api/runs`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(runs.statusCode, 200);
    assert.match(await runs.body.text(), /run-remote/u);

    const session = await startSession(root, project);
    await appendSessionTurn(root, session.id, "user", "Open this session.");
    const sessionDetail = await request(`${server.origin}/api/sessions/${encodeURIComponent(session.id)}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(sessionDetail.statusCode, 200);
    assert.match(await sessionDetail.body.text(), /Open this session/u);

    const renamed = await request(`${server.origin}/api/sessions/${encodeURIComponent(session.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ name: "Remote rename" }),
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    });
    assert.equal(renamed.statusCode, 200);
    assert.match(await renamed.body.text(), /Remote rename/u);

    const deleted = await request(`${server.origin}/api/sessions/${encodeURIComponent(session.id)}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(deleted.statusCode, 200);
    assert.match(await deleted.body.text(), /"ok":true/u);

    const deletedDetail = await request(`${server.origin}/api/sessions/${encodeURIComponent(session.id)}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(deletedDetail.statusCode, 404);
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
    await rm(staleProject, { recursive: true, force: true });
  }
});

test("remote projects include directories from existing Dream Code sessions", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-remote-session-projects-"));
  const currentProject = await mkdtemp(join(tmpdir(), "dream-remote-current-"));
  const sessionProject = await mkdtemp(join(tmpdir(), "dream-remote-session-owned-"));
  const server = await startRemoteServer({
    configRoot: root,
    bindHost: "127.0.0.1",
    port: 0,
    pairingCode: "454545",
    unsafeAllowNonTailscale: true,
    workspaceRoot: currentProject,
  });
  try {
    await startSession(root, sessionProject);
    const pair = await request(`${server.origin}/api/pair`, {
      method: "POST",
      body: JSON.stringify({ code: "454545", deviceName: "android phone" }),
      headers: { "content-type": "application/json", "x-dream-remote-token-response": "body" },
    });
    const paired = await pair.body.json() as { readonly token?: string };
    const projects = await request(`${server.origin}/api/projects`, {
      headers: { authorization: `Bearer ${paired.token ?? ""}` },
    });
    const projectText = await projects.body.text();

    assert.match(projectText, /dream-remote-current/u);
    assert.match(projectText, /dream-remote-session-owned/u);
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
    await rm(currentProject, { recursive: true, force: true });
    await rm(sessionProject, { recursive: true, force: true });
  }
});

test("remote projects refresh workspace directories without restarting the daemon", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-remote-live-projects-"));
  const currentProject = await mkdtemp(join(tmpdir(), "dream-remote-live-current-"));
  const laterProject = await mkdtemp(join(tmpdir(), "dream-remote-live-later-"));
  const server = await startRemoteServer({
    configRoot: root,
    bindHost: "127.0.0.1",
    port: 0,
    pairingCode: "565656",
    unsafeAllowNonTailscale: true,
    workspaceRoot: currentProject,
  });
  try {
    const pair = await request(`${server.origin}/api/pair`, {
      method: "POST",
      body: JSON.stringify({ code: "565656", deviceName: "android phone" }),
      headers: { "content-type": "application/json", "x-dream-remote-token-response": "body" },
    });
    const paired = await pair.body.json() as { readonly token?: string };

    const before = await request(`${server.origin}/api/projects`, {
      headers: { authorization: `Bearer ${paired.token ?? ""}` },
    });
    assert.doesNotMatch(await before.body.text(), /dream-remote-live-later/u);

    await addWorkspaceDir(root, laterProject, currentProject);
    const after = await request(`${server.origin}/api/projects`, {
      headers: { authorization: `Bearer ${paired.token ?? ""}` },
    });
    assert.match(await after.body.text(), /dream-remote-live-later/u);
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
    await rm(currentProject, { recursive: true, force: true });
    await rm(laterProject, { recursive: true, force: true });
  }
});

test("remote server rejects unauthenticated API calls and malformed pairing", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-remote-auth-"));
  const server = await startRemoteServer({
    configRoot: root,
    bindHost: "127.0.0.1",
    port: 0,
    pairingCode: "999999",
    unsafeAllowNonTailscale: true,
  });
  try {
    const unauthenticated = await request(`${server.origin}/api/projects`);
    assert.equal(unauthenticated.statusCode, 401);

    const malformed = await request(`${server.origin}/api/pair`, {
      method: "POST",
      body: JSON.stringify({ code: "000000" }),
      headers: { "content-type": "application/json", "x-dream-remote-token-response": "body" },
    });
    assert.equal(malformed.statusCode, 400);
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("remote server close tears down open event streams", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-remote-close-"));
  const server = await startRemoteServer({
    configRoot: root,
    bindHost: "127.0.0.1",
    port: 0,
    pairingCode: "121212",
    unsafeAllowNonTailscale: true,
  });
  try {
    const pair = await request(`${server.origin}/api/pair`, {
      method: "POST",
      body: JSON.stringify({ code: "121212", deviceName: "android phone" }),
      headers: { "content-type": "application/json", "x-dream-remote-token-response": "body" },
    });
    const paired = await pair.body.json() as { readonly token?: string };
    const events = await request(`${server.origin}/api/events`, {
      headers: { authorization: `Bearer ${paired.token ?? ""}` },
    });
    assert.equal(events.statusCode, 200);

    const result = await Promise.race([
      server.close().then(() => "closed"),
      new Promise<string>((resolve) => setTimeout(() => resolve("timeout"), 500)),
    ]);

    assert.equal(result, "closed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
