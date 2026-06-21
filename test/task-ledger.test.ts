import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import { stripAnsi } from "../src/ansi.js";
import {
  appendTaskRecord,
  formatTaskLedger,
  loadTaskRecords,
  updateTaskStatus,
} from "../src/task-ledger.js";

test("task ledger appends tasks and updates status", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-task-ledger-"));
  try {
    const task = await appendTaskRecord(root, "Plan", "Write the next work plan");

    const updated = await updateTaskStatus(root, task.id, "done");
    const tasks = await loadTaskRecords(root);

    assert.equal(updated?.status, "done");
    assert.equal(tasks[0]?.id, "T001");
    assert.equal(tasks[0]?.status, "done");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("formatTaskLedger renders a compact status dashboard", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-task-ledger-format-"));
  try {
    await appendTaskRecord(root, "Task", "Polish command UX");
    await appendTaskRecord(root, "Goal", "Ship the harness");
    await updateTaskStatus(root, "T002", "blocked");

    const output = stripAnsi(await formatTaskLedger(root));

    assert.match(output, /Tasks 2 total/u);
    assert.match(output, /T001 todo Task: Polish command UX/u);
    assert.match(output, /T002 blocked Goal: Ship the harness/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
