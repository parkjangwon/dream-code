import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { request } from "undici";

import { startRemoteServer } from "../src/remote-server.js";

test("remote viewer devices can inspect but cannot submit commands", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-remote-rbac-"));
  const server = await startRemoteServer({
    configRoot: root,
    bindHost: "127.0.0.1",
    port: 0,
    pairingCode: "222222",
    unsafeAllowNonTailscale: true,
    commandRunner: async () => ({ sessionId: "rbac-session", output: "ok", shouldContinue: true }),
  });
  try {
    const viewer = await pairToken(server.origin, "viewer");
    const operator = await pairToken(server.origin, "operator");

    const projects = await request(`${server.origin}/api/projects`, {
      headers: { authorization: `Bearer ${viewer}` },
    });
    assert.equal(projects.statusCode, 200);

    const denied = await request(`${server.origin}/api/commands`, {
      method: "POST",
      body: JSON.stringify({ prompt: "/status" }),
      headers: { authorization: `Bearer ${viewer}`, "content-type": "application/json" },
    });
    assert.equal(denied.statusCode, 403);
    assert.match(await denied.body.text(), /operator role required/u);

    const accepted = await request(`${server.origin}/api/commands`, {
      method: "POST",
      body: JSON.stringify({ prompt: "/status" }),
      headers: { authorization: `Bearer ${operator}`, "content-type": "application/json" },
    });
    assert.equal(accepted.statusCode, 202);
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});

async function pairToken(origin: string, role: "viewer" | "operator"): Promise<string> {
  const paired = await request(`${origin}/api/pair`, {
    method: "POST",
    body: JSON.stringify({ code: "222222", deviceName: `${role}-device`, role }),
    headers: { "content-type": "application/json" },
  });
  assert.equal(paired.statusCode, 200);
  const body = await paired.body.json() as { readonly token?: string; readonly device?: { readonly role?: string } };
  assert.equal(body.device?.role, role);
  assert.equal(typeof body.token, "string");
  return body.token ?? "";
}
