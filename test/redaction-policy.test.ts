import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { startAgentRun } from "../src/agent-run-store.js";
import { formatAgentRunShowJson } from "../src/agent-run-history.js";
import { appendRemoteAuditEvent, readRemoteAuditEvents } from "../src/remote-audit.js";

test("run audit json redacts bearer and API-key shaped secrets", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-redact-run-"));
  try {
    const run = await startAgentRun(root, {
      id: "run-secret",
      kind: "agent",
      agentId: "dream",
      agentName: "Dream",
      prompt: "Use Bearer sk-live-abcdefghijklmnopqrstuvwxyz123456 to debug",
    });
    await run.finish("failed", { error: "OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuvwxyz123456 leaked in stderr" });

    const output = await formatAgentRunShowJson(root, "run-secret");
    assert.doesNotMatch(output, /sk-live-abcdefghijklmnopqrstuvwxyz123456/u);
    assert.doesNotMatch(output, /sk-proj-abcdefghijklmnopqrstuvwxyz123456/u);
    assert.match(output, /\[redacted:bearer-token\]/u);
    assert.match(output, /\[redacted:api-key\]/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("remote audit persists redacted event fields", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-redact-remote-"));
  try {
    await appendRemoteAuditEvent(root, {
      kind: "auth_denied",
      path: "/api/commands?token=shh-secret-token",
      message: "Authorization: Bearer sk-live-abcdefghijklmnopqrstuvwxyz123456",
      status: 401,
    });

    const [event] = await readRemoteAuditEvents(root);
    assert.notEqual(event, undefined);
    const serialized = JSON.stringify(event);
    assert.doesNotMatch(serialized, /shh-secret-token/u);
    assert.doesNotMatch(serialized, /sk-live-abcdefghijklmnopqrstuvwxyz123456/u);
    assert.match(serialized, /\[redacted:query-secret\]/u);
    assert.match(serialized, /\[redacted:bearer-token\]/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
