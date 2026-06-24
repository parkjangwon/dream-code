import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import { defaultConfig } from "../src/config.js";
import { formatSmokeReport, runSmoke } from "../src/smoke.js";

test("runSmoke includes a repair action for every readiness check", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-smoke-repair-home-"));
  try {
    const report = await runSmoke({
      cwd: process.cwd(),
      configRoot: root,
      config: defaultConfig(),
      oneShotYolo: false,
    });
    const text = formatSmokeReport(report);

    assert.equal(report.checks.every((check) => check.repair.length > 0), true);
    assert.match(text, /repair:/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
