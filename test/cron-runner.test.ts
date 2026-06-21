import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import { defaultConfig } from "../src/config.js";
import { createCronJob, createCronProject, listCronRuns } from "../src/cron-store.js";
import { runDueCronJobs } from "../src/cron-runner.js";

test("runDueCronJobs executes due jobs and saves a markdown artifact", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-cron-runner-"));
  const projectRoot = await mkdtemp(join(tmpdir(), "dream-cron-project-"));
  try {
    const project = await createCronProject(root, { name: "dream-code", cwd: projectRoot });
    const job = await createCronJob(root, {
      projectId: project.id,
      name: "Daily status",
      schedule: "0 9 * * *",
      timezone: "UTC",
      prompt: "Summarize status",
      permissionMode: "ask",
      modelMode: "auto",
      notify: false,
      nextRunAt: "2026-06-21T09:00:00.000Z",
    });

    const result = await runDueCronJobs({
      config: defaultConfig(),
      configRoot: root,
      now: new Date("2026-06-21T09:00:00.000Z"),
      runAgent: async () => "Project is healthy.",
      write: () => true,
    });
    const runs = await listCronRuns(root, job.id);
    const artifact = await readFile(runs[0]?.artifactPath ?? "", "utf8");

    assert.equal(result.completed, 1);
    assert.equal(runs[0]?.status, "completed");
    assert.match(artifact, /# Daily status/u);
    assert.match(artifact, /Project is healthy\./u);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
});
