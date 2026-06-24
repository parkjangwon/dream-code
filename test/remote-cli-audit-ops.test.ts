import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createRemoteAuth, remoteDevicesPath } from "../src/remote-auth.js";
import { formatRemoteAudit, revokeRemoteDeviceById } from "../src/remote-cli-audit.js";

test("remote audit json includes manageable devices without token hashes", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-remote-audit-devices-"));
  try {
    const auth = createRemoteAuth(root, "123456");
    const paired = await auth.pairDevice({
      code: "123456",
      deviceName: "ops laptop",
      remoteAddress: "127.0.0.1",
    });
    assert.equal(paired.ok, true);

    const rawStore = await readFile(remoteDevicesPath(root), "utf8");
    assert.match(rawStore, /tokenHash/u);

    const audit = JSON.parse(await formatRemoteAudit(root, true)) as {
      readonly devices?: readonly { readonly id: string; readonly name: string; readonly tokenHash?: string }[];
    };
    assert.equal(audit.devices?.[0]?.name, "ops laptop");
    assert.equal(audit.devices?.[0]?.tokenHash, undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("remote revoke json removes a device and keeps the response public", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-remote-revoke-"));
  try {
    const auth = createRemoteAuth(root, "333333");
    const paired = await auth.pairDevice({
      code: "333333",
      deviceName: "old phone",
      remoteAddress: "127.0.0.1",
    });
    assert.equal(paired.ok, true);
    const deviceId = paired.device.id;

    const output = JSON.parse(await revokeRemoteDeviceById(root, deviceId, true)) as {
      readonly revoked: boolean;
      readonly devices: readonly { readonly id: string; readonly tokenHash?: string }[];
    };

    assert.equal(output.revoked, true);
    assert.equal(output.devices.some((device) => device.id === deviceId), false);
    assert.equal(output.devices.some((device) => device.tokenHash !== undefined), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
