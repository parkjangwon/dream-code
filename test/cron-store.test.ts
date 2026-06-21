import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import {
  createCronJob,
  createCronProject,
  createCronRun,
  listCronJobs,
  listCronProjects,
  listCronRuns,
  pauseCronJob,
  renameCronProject,
} from "../src/cron-store.js";

test("cron store persists project job and run records", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-cron-store-"));
  try {
    const project = await createCronProject(root, { name: "dream-code", cwd: "/repo/dream-code" });
    const renamed = await renameCronProject(root, project.id, "night-builds");
    const job = await createCronJob(root, {
      projectId: project.id,
      name: "Daily tests",
      schedule: "0 9 * * *",
      timezone: "UTC",
      prompt: "Run tests",
      permissionMode: "ask",
      modelMode: "auto",
      notify: true,
      nextRunAt: "2026-06-21T09:00:00.000Z",
    });
    await pauseCronJob(root, job.id, true);
    const run = await createCronRun(root, {
      jobId: job.id,
      status: "completed",
      startedAt: "2026-06-21T09:00:00.000Z",
      finishedAt: "2026-06-21T09:00:01.000Z",
      summary: "Done",
      artifactPath: "/tmp/result.md",
    });

    const projects = await listCronProjects(root);
    const jobs = await listCronJobs(root, project.id);
    const runs = await listCronRuns(root, job.id);

    assert.equal(renamed?.name, "night-builds");
    assert.equal(projects[0]?.name, "night-builds");
    assert.equal(jobs[0]?.enabled, false);
    assert.equal(jobs[0]?.prompt, "Run tests");
    assert.equal(runs[0]?.id, run.id);
    assert.equal(runs[0]?.summary, "Done");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
