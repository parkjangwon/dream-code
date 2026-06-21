import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import { stripAnsi } from "../src/ansi.js";
import { defaultConfig } from "../src/config.js";
import { startGoalState } from "../src/goal-state.js";
import { recordModelTelemetry } from "../src/model-telemetry.js";
import { formatStatusDashboard } from "../src/status-dashboard.js";
import { appendTaskRecord } from "../src/task-ledger.js";

test("formatStatusDashboard combines model, goal, and task state", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-status-dashboard-"));
  try {
    await startGoalState(root, "Ship Dream Code");
    await appendTaskRecord(root, "Task", "Polish status dashboard");
    await recordModelTelemetry(root, {
      provider: "deepseek",
      model: "deepseek-v4-flash",
      ok: true,
      elapsedMs: 900,
      inputChars: 100,
      outputChars: 300,
    });

    const output = stripAnsi(await formatStatusDashboard(root, defaultConfig(), true));

    assert.match(output, /Dream Status/u);
    assert.match(output, /Ship Dream Code/u);
    assert.match(output, /1 open/u);
    assert.match(output, /deepseek\/deepseek-v4-flash/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
