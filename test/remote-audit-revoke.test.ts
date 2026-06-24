import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createRemoteAuth } from "../src/remote-auth.js";
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
