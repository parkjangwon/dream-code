import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createRemoteAuth, listRemoteDevices } from "../src/remote-auth.js";
import { formatRemoteAudit, revokeRemoteDeviceById } from "../src/remote-cli-audit.js";

test("remote audit and revoke JSON expose device management without token hashes", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-remote-audit-cli-"));
  try {
    const auth = createRemoteAuth(root, "123123");
    const paired = await auth.pairDevice({
      code: "123123",
      deviceName: "ops laptop",
      remoteAddress: "test",
      role: "operator",
    });
    assert.equal(paired.ok, true);
    const deviceId = paired.ok ? paired.device.id : "";

    const audit = await formatRemoteAudit(root, true);
    assert.doesNotMatch(audit, /tokenHash/u);
    assert.match(audit, /"devices"/u);
    assert.match(audit, /"role": "operator"/u);

    const revoked = await revokeRemoteDeviceById(root, deviceId, true);
    assert.match(revoked, /"revoked": true/u);
    assert.doesNotMatch(revoked, /tokenHash/u);
    assert.doesNotMatch(revoked, new RegExp(deviceId, "u"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("remote auth records token expiry and last seen timestamps", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-remote-auth-seen-"));
  try {
    const auth = createRemoteAuth(root, "456456");
    const paired = await auth.pairDevice({
      code: "456456",
      deviceName: "phone",
      remoteAddress: "test",
      role: "operator",
    });
    assert.equal(paired.ok, true);
    const token = paired.ok ? paired.token : "";
    assert.equal(typeof (paired.ok ? paired.device.expiresAt : undefined), "string");

    const before = await listRemoteDevices(root);
    assert.equal(before[0]?.lastSeenAt, undefined);

    const authenticated = await auth.authenticate(token);
    assert.equal(authenticated?.name, "phone");

    const after = await listRemoteDevices(root);
    assert.equal(typeof after[0]?.lastSeenAt, "string");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("remote auth throttles repeated last seen writes", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-remote-auth-throttle-"));
  try {
    const auth = createRemoteAuth(root, "654654");
    const paired = await auth.pairDevice({
      code: "654654",
      deviceName: "tablet",
      remoteAddress: "test",
      role: "operator",
    });
    assert.equal(paired.ok, true);
    const token = paired.ok ? paired.token : "";

    await auth.authenticate(token);
    const first = await listRemoteDevices(root);
    const firstSeenAt = first[0]?.lastSeenAt;
    assert.equal(typeof firstSeenAt, "string");

    await auth.authenticate(token);
    const second = await listRemoteDevices(root);
    assert.equal(second[0]?.lastSeenAt, firstSeenAt);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("remote auth preserves concurrent pair writes with atomic store updates", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-remote-auth-concurrent-"));
  try {
    const auth = createRemoteAuth(root, "111222");
    const paired = await Promise.all(Array.from({ length: 12 }, (_, index) => auth.pairDevice({
      code: "111222",
      deviceName: `device-${index}`,
      remoteAddress: `test-${index}`,
      role: "operator",
    })));

    assert.equal(paired.every((result) => result.ok), true);
    const devices = await listRemoteDevices(root);
    assert.equal(devices.length, 12);
    assert.deepEqual(new Set(devices.map((device) => device.name)).size, 12);
    const remoteFiles = await readdir(join(root, "remote"));
    assert.equal(remoteFiles.some((file) => file.endsWith(".tmp")), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
