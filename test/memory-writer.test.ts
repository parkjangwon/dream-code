import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { AgentDefinition } from "../src/agent-library.js";
import { listActors } from "../src/actor-store.js";
import { writeSwarmMemory } from "../src/memory-writer.js";

test("hidden memory writer absorbs swarm output into checkpoint and task progress", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-memory-writer-"));
  try {
    const output = await writeSwarmMemory(root, "/repo", "session-a", {
      goal: "Audit security",
      laneResults: [
        {
          lane: {
            id: "lane-1",
            title: "Security Reviewer",
            agent: agent("security-reviewer", "Security Reviewer"),
            prompt: "Audit security",
          },
          output: "No leaked secrets.",
          elapsedMs: 1200,
        },
      ],
      synthesis: "Overall security looks acceptable.",
    });

    const checkpoint = await readFile(output.checkpointPath, "utf8");
    const progress = await readFile(output.taskProgressPaths[0] ?? "", "utf8");
    const actors = await listActors(root);

    assert.match(checkpoint, /Audit security/u);
    assert.match(checkpoint, /Overall security/u);
    assert.match(checkpoint, /Agent: security-reviewer/u);
    assert.match(checkpoint, /Prompt: Audit security/u);
    assert.match(progress, /Security Reviewer/u);
    assert.match(progress, /Signal: needs-review/u);
    assert.match(progress, /No leaked secrets/u);
    assert.equal(actors[0]?.name, "memory-writer");
    assert.equal(actors[0]?.status, "done");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function agent(id: string, name: string): AgentDefinition {
  return {
    id,
    name,
    summary: `${name} summary.`,
    model: "inherit",
    tools: ["read"],
    prompt: `${name} prompt.`,
    source: "built-in",
  };
}
