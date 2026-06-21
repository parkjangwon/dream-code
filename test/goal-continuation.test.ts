import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { continueGoalIfNeeded } from "../src/goal-continuation.js";
import { defaultConfig } from "../src/config.js";
import { loadGoalState, startGoalState } from "../src/goal-state.js";
import { appendSessionTurn, listSessions, startSession } from "../src/session-store.js";

test("goal continuation adds a synthetic follow-up when the judge says incomplete", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-goal-continuation-"));
  try {
    const session = await startSession(root, "/tmp/dream-code");
    await startGoalState(root, "Finish the release");
    await appendSessionTurn(root, session.id, "user", "ship it");
    await appendSessionTurn(root, session.id, "assistant", "I only planned it.");

    const continued = await continueGoalIfNeeded({
      config: defaultConfig(),
      configRoot: root,
      userText: "ship it",
      assistantTranscript: "I only planned it.",
      cwd: "/tmp/dream-code",
      write: () => undefined,
      sessionRuntime: {
        currentId: () => session.id,
        switchTo: () => undefined,
      },
      judge: async () => ({ satisfied: false, confidence: 0.8, reason: "No verification evidence." }),
      runContinuation: async (prompt) => `continued from ${prompt}`,
    });

    const [stored] = await listSessions(root);
    const goal = await loadGoalState(root);
    assert.equal(continued, true);
    assert.equal(goal?.status, "active");
    assert.equal(stored?.turns.at(-2)?.role, "user");
    assert.match(stored?.turns.at(-2)?.content ?? "", /Continue the active Dream Code goal/u);
    assert.equal(stored?.turns.at(-1)?.role, "assistant");
    assert.match(stored?.turns.at(-1)?.content ?? "", /continued from/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("goal continuation completes the goal when the judge is confident", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-goal-complete-"));
  try {
    await startGoalState(root, "Finish the release");
    const continued = await continueGoalIfNeeded({
      config: defaultConfig(),
      configRoot: root,
      userText: "ship it",
      assistantTranscript: "Tests pass.",
      cwd: "/tmp/dream-code",
      write: () => undefined,
      judge: async () => ({ satisfied: true, confidence: 0.9, reason: "Verified." }),
      runContinuation: async () => "should not run",
    });

    const goal = await loadGoalState(root);
    assert.equal(continued, false);
    assert.equal(goal?.status, "complete");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
