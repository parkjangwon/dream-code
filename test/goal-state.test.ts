import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import {
  clearGoalState,
  completeGoalState,
  formatGoalStatus,
  loadGoalState,
  startGoalState,
} from "../src/goal-state.js";
import { stripAnsi } from "../src/ansi.js";

test("goal state starts, completes, and clears an active goal", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-goal-state-"));
  try {
    const started = await startGoalState(root, "Ship Dream Code");
    const completed = await completeGoalState(root, "tests pass");
    const cleared = await clearGoalState(root);

    assert.equal(started.status, "active");
    assert.equal(completed?.status, "complete");
    assert.equal(cleared, true);
    assert.equal(await loadGoalState(root), undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("formatGoalStatus renders empty and active states", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-goal-status-"));
  try {
    assert.match(stripAnsi(await formatGoalStatus(root)), /No active goal/u);
    await startGoalState(root, "Build the tool loop");

    const status = stripAnsi(await formatGoalStatus(root));

    assert.match(status, /Goal/u);
    assert.match(status, /Build the tool loop/u);
    assert.match(status, /active/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
