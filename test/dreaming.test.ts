import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runDreaming, type DreamingSummarizer } from "../src/dreaming.js";
import { appendSessionTurn, startSession } from "../src/session-store.js";

test("runDreaming persists deduplicated long-term memories when a session ends", async () => {
  const root = await mkdtemp(join(tmpdir(), "dreaming-memory-"));
  try {
    const session = await startSession(root, "/tmp/dreaming-project");
    await appendSessionTurn(root, session.id, "user", "When I ask for release, update README and verify CI.");
    await appendSessionTurn(root, session.id, "assistant", "Understood. I will test, tag, push, and verify the release.");
    const summarizer: DreamingSummarizer = async () => [
      {
        kind: "user-preference",
        title: "Release requests include docs and verification",
        body: "When the user asks for a release, update README, run tests, tag, push, and verify the release artifact.",
      },
      {
        kind: "workflow-recipe",
        title: "Dream Code release flow",
        body: "Bump version files, run the full test suite, pack-check the npm artifact, push main and tag, then confirm the GitHub release.",
      },
    ];

    const first = await runDreaming(root, session.id, { summarizer });

    if (first.kind !== "saved") {
      assert.fail(`Expected saved result, got ${first.kind}`);
    }
    assert.equal(first.added, 2);
    const memory = await readFile(first.filePath, "utf8");
    assert.match(memory, /## Dreaming/u);
    assert.match(memory, /Release requests include docs and verification/u);
    assert.match(memory, /Dream Code release flow/u);

    const second = await runDreaming(root, session.id, { summarizer });

    if (second.kind !== "saved") {
      assert.fail(`Expected saved result, got ${second.kind}`);
    }
    assert.equal(second.added, 0);
    const updated = await readFile(second.filePath, "utf8");
    assert.equal(countMatches(updated, "Release requests include docs and verification"), 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function countMatches(value: string, needle: string): number {
  return value.split(needle).length - 1;
}
