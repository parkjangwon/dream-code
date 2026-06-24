import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import {
  appendSessionTurn,
  listSessions,
  renameSession,
  sessionIndexPath,
  startSession,
} from "../src/session-store.js";
import { deleteSession } from "../src/session-delete.js";
import { loadWorkspaceDirs } from "../src/workspace-state.js";

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

test("session store uses an index and per-session wire log", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-session-layout-"));
  try {
    const session = await startSession(root, "/tmp/dream-code");
    await appendSessionTurn(root, session.id, "user", "Ship a Termux-friendly session store.");

    const indexLine = (await readFile(sessionIndexPath(root), "utf8")).trim();
    const indexEntry = JSON.parse(indexLine);

    assert.equal(indexEntry.sessionId, session.id);
    assert.equal(indexEntry.directory, "/tmp/dream-code");

    const state = JSON.parse(await readFile(join(indexEntry.sessionDir, "state.json"), "utf8"));
    const wire = (await readFile(join(indexEntry.sessionDir, "wire.jsonl"), "utf8")).trim();

    assert.equal(state.summary, "Ship a Termux-friendly session store.");
    assert.match(wire, /"type":"turn"/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("startSession remembers the project directory for remote project history", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-session-project-history-"));
  const project = await mkdtemp(join(tmpdir(), "dream-session-project-"));
  try {
    await startSession(root, project);
    await startSession(root, project);

    assert.deepEqual(await loadWorkspaceDirs(root), [project]);
  } finally {
    await rm(project, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  }
});

test("startSession prunes previous sessions with no turns", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-session-prune-empty-"));
  try {
    const empty = await startSession(root, "/tmp/dream-code");
    const emptyIndexLine = (await readFile(sessionIndexPath(root), "utf8")).trim();
    const emptyIndexEntry = JSON.parse(emptyIndexLine);
    const next = await startSession(root, "/tmp/dream-code");
    const indexLines = (await readFile(sessionIndexPath(root), "utf8")).trim().split(/\r?\n/u);
    const remaining = indexLines.map((line) => JSON.parse(line));

    assert.equal(empty.id.startsWith("session_"), true);
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0]?.sessionId, next.id);
    await assert.rejects(readFile(join(emptyIndexEntry.sessionDir, "state.json"), "utf8"), /ENOENT/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("startSession keeps previous sessions with turns", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-session-keep-nonempty-"));
  try {
    const kept = await startSession(root, "/tmp/dream-code");
    await appendSessionTurn(root, kept.id, "user", "Keep this session.");
    const next = await startSession(root, "/tmp/dream-code");
    const indexLines = (await readFile(sessionIndexPath(root), "utf8")).trim().split(/\r?\n/u);
    const sessionIds = indexLines.map((line) => JSON.parse(line).sessionId);

    assert.equal(sessionIds.includes(kept.id), true);
    assert.equal(sessionIds.includes(next.id), true);
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

test("deleteSession removes a session from the index and disk", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-session-delete-"));
  try {
    const deleted = await startSession(root, "/tmp/dream-code");
    await appendSessionTurn(root, deleted.id, "user", "Delete this session.");
    const kept = await startSession(root, "/tmp/other-project");
    const beforeIndexLines = (await readFile(sessionIndexPath(root), "utf8")).trim().split(/\r?\n/u);
    const deletedIndexEntry = beforeIndexLines.map((line) => JSON.parse(line)).find((entry) => entry.sessionId === deleted.id);

    assert.equal(await deleteSession(root, deleted.id), true);
    assert.equal(await deleteSession(root, "missing-session"), false);

    const sessions = await listSessions(root);
    const afterIndex = await readFile(sessionIndexPath(root), "utf8");
    assert.equal(sessions.some((session) => session.id === deleted.id), false);
    assert.equal(sessions.some((session) => session.id === kept.id), true);
    assert.doesNotMatch(afterIndex, new RegExp(deleted.id, "u"));
    await assert.rejects(readFile(join(deletedIndexEntry.sessionDir, "state.json"), "utf8"), /ENOENT/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
