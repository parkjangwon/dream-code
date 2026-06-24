import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { request } from "undici";

import { createRemoteAuth, listRemoteDevices, revokeRemoteDevice } from "../src/remote-auth.js";
import { readRemoteAuditEvents } from "../src/remote-audit.js";
import { startRemoteServer } from "../src/remote-server.js";

test("remote server records auth failures and malformed pairing in the audit log", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-remote-audit-"));
  const server = await startRemoteServer({
    configRoot: root,
    bindHost: "127.0.0.1",
    port: 0,
    pairingCode: "222222",
    unsafeAllowNonTailscale: true,
  });
  try {
    const unauthenticated = await request(`${server.origin}/api/projects`);
    const malformed = await request(`${server.origin}/api/pair`, {
      method: "POST",
      body: JSON.stringify({ code: "222222" }),
      headers: { "content-type": "application/json" },
    });

    assert.equal(unauthenticated.statusCode, 401);
    assert.equal(malformed.statusCode, 400);
    const events = await readRemoteAuditEvents(root);
    assert.equal(events.some((event) => event.kind === "auth_denied"), true);
    assert.equal(events.some((event) => event.kind === "pair_malformed"), true);
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("remote auth devices can expire and be revoked", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-remote-revoke-"));
  try {
    const auth = createRemoteAuth(root, "333333", { tokenTtlMs: 1 });
    const paired = await auth.pairDevice({ code: "333333", deviceName: "phone", remoteAddress: "test" });
    assert.equal(paired.ok, true);
    if (!paired.ok) {
      return;
    }

    assert.equal((await listRemoteDevices(root)).length, 1);
    assert.equal(await revokeRemoteDevice(root, paired.device.id), true);
    assert.equal(await auth.authenticate(paired.token), undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
