import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { appendRemoteLog, remoteLogPath } from "../src/remote-log.js";

test("appendRemoteLog writes to webapp remote log under the config root", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-remote-log-"));
  try {
    await appendRemoteLog(root, "server started", { now: new Date("2026-06-24T10:00:00.000Z") });

    const log = await readFile(remoteLogPath(root), "utf8");
    assert.match(log, /2026-06-24T10:00:00.000Z server started/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("appendRemoteLog rotates and compresses oversized remote logs", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-remote-log-rotate-"));
  try {
    await appendRemoteLog(root, "first line fills the tiny log", {
      maxBytes: 20,
      maxArchives: 2,
      now: new Date("2026-06-24T10:00:00.000Z"),
    });
    await appendRemoteLog(root, "second line rotates it", {
      maxBytes: 20,
      maxArchives: 2,
      now: new Date("2026-06-24T10:00:01.000Z"),
    });

    const entries = await readdir(join(root, "webapp"));
    const archives = entries.filter((entry) => entry.endsWith(".log.gz"));
    const activeSize = (await stat(remoteLogPath(root))).size;

    assert.equal(archives.length, 1);
    assert.equal(activeSize > 0, true);
    assert.equal(activeSize < 200, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
