import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  appendTaskProgress,
  ensureProjectMemory,
  formatMemoryContext,
  memoryProjectRoot,
  writeCheckpoint,
} from "../src/memory-store.js";

test("memory store keeps project memory, checkpoint, and task progress layers", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-memory-"));
  try {
    const projectRoot = "/workspace/dream-code";
    const memoryPath = await ensureProjectMemory(root, projectRoot);
    await writeCheckpoint(root, projectRoot, "session-a", {
      title: "Swarm checkpoint",
      body: "The swarm reviewed the provider layer.",
    });
    const progressPath = await appendTaskProgress(root, projectRoot, "T001", "Security lane found no secrets.");
    await appendTaskProgress(root, projectRoot, "T002", "Provider routing still needs OpenAI OAuth cleanup.");
    const context = await formatMemoryContext(root, projectRoot, "session-a", "fix provider oauth");

    assert.equal(memoryPath, join(memoryProjectRoot(root, projectRoot), "MEMORY.md"));
    assert.equal(progressPath, join(memoryProjectRoot(root, projectRoot), "tasks", "T001", "progress.md"));
    assert.match(await readFile(memoryPath, "utf8"), /Project Memory/u);
    assert.match(context, /MEMORY\.md/u);
    assert.match(context, /checkpoint\.md/u);
    assert.match(context, /relevant memory/u);
    assert.match(context, /Provider routing/u);
    assert.match(context, /Security lane/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
