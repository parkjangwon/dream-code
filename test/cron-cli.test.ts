import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { runCliCronCommand } from "../src/cron-cli.js";
import { listCronJobs, listCronProjects } from "../src/cron-store.js";

test("runCliCronCommand creates jobs with the default permission mode", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-cron-cli-"));
  try {
    await runCliCronCommand(["add", "--name", "daily", "every", "day", "at", "09:00", "run", "tests"], root);

    const project = (await listCronProjects(root))[0];
    assert.notEqual(project, undefined);
    if (project === undefined) {
      throw new Error("Expected a cron project.");
    }
    const jobs = await listCronJobs(root, project.id);

    assert.equal(jobs[0]?.name, "daily");
    assert.equal(jobs[0]?.permissionMode, "ask");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
