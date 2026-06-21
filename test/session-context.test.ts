import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import { recentSessionMessages } from "../src/session-context.js";
import { appendSessionTurn, startSession } from "../src/session-store.js";

test("recentSessionMessages carries previous turns and excludes the current prompt", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-session-context-"));
  try {
    const session = await startSession(root, "/tmp/dream-context");
    await appendSessionTurn(root, session.id, "user", "Remember the release flow.");
    await appendSessionTurn(root, session.id, "assistant", "I will update README, test, tag, and verify release.");
    await appendSessionTurn(root, session.id, "user", "Continue with that flow.");

    const messages = await recentSessionMessages(root, session.id, "Continue with that flow.");

    assert.deepEqual(messages.map((message) => message.role), ["user"]);
    assert.match(messages[0]?.content ?? "", /<session-context>/u);
    assert.match(messages[0]?.content ?? "", /Remember the release flow/u);
    assert.match(messages[0]?.content ?? "", /update README/u);
    assert.doesNotMatch(messages.map((message) => message.content).join("\n"), /Continue with that flow/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
