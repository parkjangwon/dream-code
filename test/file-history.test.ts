import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import { restoreLatestFileCheckpoint, saveFileCheckpoint } from "../src/file-history.js";

test("file history restores the latest checkpoint for a workspace file", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-file-history-root-"));
  const project = await mkdtemp(join(tmpdir(), "dream-file-history-project-"));
  try {
    await mkdir(join(project, "src"), { recursive: true });
    await writeFile(join(project, "src", "index.ts"), "before\n", "utf8");

    const checkpoint = await saveFileCheckpoint("src/index.ts", project, root);
    await writeFile(join(project, "src", "index.ts"), "after\n", "utf8");
    const restoredPath = await restoreLatestFileCheckpoint("src/index.ts", project, root);

    assert.match(checkpoint?.snapshotPath ?? "", /snapshot/u);
    assert.equal(restoredPath, join(project, "src", "index.ts"));
    assert.equal(await readFile(restoredPath, "utf8"), "before\n");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("file history checkpoints the current file before restoring", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-file-history-root-"));
  const project = await mkdtemp(join(tmpdir(), "dream-file-history-project-"));
  try {
    await mkdir(join(project, "src"), { recursive: true });
    const filePath = join(project, "src", "index.ts");
    await writeFile(filePath, "before\n", "utf8");
    await saveFileCheckpoint("src/index.ts", project, root);
    await writeFile(filePath, "after\n", "utf8");

    await restoreLatestFileCheckpoint("src/index.ts", project, root);
    assert.equal(await readFile(filePath, "utf8"), "before\n");

    await restoreLatestFileCheckpoint("src/index.ts", project, root);
    assert.equal(await readFile(filePath, "utf8"), "after\n");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});
