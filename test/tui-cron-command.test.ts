import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { stripAnsi } from "../src/ansi.js";
import { defaultConfig } from "../src/config.js";
import { listCronJobs, listCronProjects } from "../src/cron-store.js";
import { runWorkspaceCommand } from "../src/tui-workspace-commands.js";

test("runWorkspaceCommand creates a confirmed cron draft from natural language", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-cron-command-"));
  const projectRoot = await mkdtemp(join(tmpdir(), "dream-cron-command-project-"));
  const chunks: string[] = [];
  const stdout = mock.method(process.stdout, "write", (chunk: string) => {
    chunks.push(chunk);
    return true;
  });
  try {
    await runWorkspaceCommand(
      "/cron every day at 09:00 run tests and summarize failures",
      defaultConfig(),
      true,
      { question: async () => "create" },
      root,
      undefined,
      projectRoot,
    );

    const projects = await listCronProjects(root);
    const jobs = await listCronJobs(root, projects[0]?.id);
    const outputText = stripAnsi(chunks.join(""));
    assert.match(outputText, /Cron draft/u);
    assert.match(outputText, /cron created/u);
    assert.equal(projects[0]?.cwd, projectRoot);
    assert.equal(jobs[0]?.schedule, "0 9 * * *");
    assert.equal(jobs[0]?.prompt, "run tests and summarize failures");
  } finally {
    stdout.mock.restore();
    await rm(root, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("runWorkspaceCommand lists cron projects and jobs", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-cron-list-"));
  const projectRoot = await mkdtemp(join(tmpdir(), "dream-cron-list-project-"));
  const chunks: string[] = [];
  const stdout = mock.method(process.stdout, "write", (chunk: string) => {
    chunks.push(chunk);
    return true;
  });
  try {
    await runWorkspaceCommand(
      "/cron every day at 09:00 run tests",
      defaultConfig(),
      true,
      { question: async () => "create" },
      root,
      undefined,
      projectRoot,
    );
    chunks.length = 0;

    await runWorkspaceCommand("/cron", defaultConfig(), true, { question: async () => "" }, root, undefined, projectRoot);

    const outputText = stripAnsi(chunks.join(""));
    assert.match(outputText, /Cron/u);
    assert.match(outputText, /dream-cron-list-project/u);
    assert.match(outputText, /run tests/u);
  } finally {
    stdout.mock.restore();
    await rm(root, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("runWorkspaceCommand manages cron job lifecycle from the TUI", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-cron-manage-"));
  const projectRoot = await mkdtemp(join(tmpdir(), "dream-cron-manage-project-"));
  const writes: string[] = [];
  const stdout = mock.method(process.stdout, "write", (chunk: string) => {
    writes.push(chunk);
    return true;
  });

  try {
    await runWorkspaceCommand(
      "/cron every day at 09:00 run tests",
      defaultConfig(),
      true,
      { question: async () => "" },
      root,
      undefined,
      projectRoot,
    );
    await runWorkspaceCommand("/cron pause Run Tests", defaultConfig(), true, { question: async () => "" }, root, undefined, projectRoot);
    let [job] = await listCronJobs(root);
    assert.equal(job?.enabled, false);

    await runWorkspaceCommand("/cron resume Run Tests", defaultConfig(), true, { question: async () => "" }, root, undefined, projectRoot);
    [job] = await listCronJobs(root);
    assert.equal(job?.enabled, true);

    await runWorkspaceCommand("/cron rename Run Nightly", defaultConfig(), true, { question: async () => "" }, root, undefined, projectRoot);
    [job] = await listCronJobs(root);
    assert.equal(job?.name, "Nightly");

    await runWorkspaceCommand("/cron delete Nightly", defaultConfig(), true, { question: async () => "delete" }, root, undefined, projectRoot);
    const jobs = await listCronJobs(root);
    assert.equal(jobs.length, 0);

    const outputText = stripAnsi(writes.join(""));
    assert.match(outputText, /cron paused/u);
    assert.match(outputText, /cron resumed/u);
    assert.match(outputText, /cron renamed/u);
    assert.match(outputText, /cron deleted/u);
  } finally {
    stdout.mock.restore();
    await rm(root, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
});
