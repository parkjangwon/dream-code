import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import {
  appendSessionTurn,
  listSessions,
  renameSession,
  startSession,
} from "../src/session-store.js";

test("session store records a session summary from the latest user turn", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-session-store-"));
  try {
    const session = await startSession(root, "/tmp/dream-code");
    await appendSessionTurn(root, session.id, "user", "Implement provider routing. Then add tests.");
    const sessions = await listSessions(root);

    assert.equal(sessions[0]?.name, "dream-code");
    assert.equal(sessions[0]?.summary, "Implement provider routing.");
    assert.equal(sessions[0]?.turns.length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("renameSession updates the current session name and summary", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-session-rename-"));
  try {
    const session = await startSession(root, "/tmp/dream-code");
    const renamed = await renameSession(root, session.id, "Provider cleanup");

    assert.equal(renamed?.name, "Provider cleanup");
    assert.equal(renamed?.summary, "Provider cleanup");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
