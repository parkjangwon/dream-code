import { cwd as currentWorkingDirectory, stdout as output } from "node:process";
import { setTimeout as sleep } from "node:timers/promises";

import { defaultConfigRoot, loadConfig } from "./config.js";
import { runCronProjectCommand } from "./cron-cli-project.js";
import {
  draftName,
  formatJobLine,
  isAbortError,
  localTimezone,
  parseDaemonInterval,
  parseMode,
  parseOptions,
  parsePermissionMode,
  printCronUsage,
} from "./cron-cli-utils.js";
import { parseCronDraft } from "./cron-schedule.js";
import {
  createCronJob,
  createCronProject,
  deleteCronJob,
  findCronJob,
  findCronProject,
  listCronJobs,
  listCronProjects,
  pauseCronJob,
  updateCronJob,
} from "./cron-store.js";
import { runCronJob, runDueCronJobs } from "./cron-runner.js";
import type { CronProject } from "./cron-types.js";

export async function runCliCronCommand(args: readonly string[], root = defaultConfigRoot()): Promise<void> {
  const command = args[0] ?? "list";
  switch (command) {
    case "list":
      await printCronList(root);
      return;
    case "add":
    case "create":
      await createCronFromArgs(root, args.slice(1), currentWorkingDirectory());
      return;
    case "run":
      await runCronByQuery(root, args.slice(1).join(" "));
      return;
    case "pause":
      await setCronPaused(root, args.slice(1).join(" "), true);
      return;
    case "resume":
      await setCronPaused(root, args.slice(1).join(" "), false);
      return;
    case "delete":
    case "remove":
      await deleteCronByQuery(root, args.slice(1).join(" "));
      return;
    case "rename":
      await renameCronJobByArgs(root, args.slice(1));
      return;
    case "project":
      await runCronProjectCommand(root, args.slice(1));
      return;
    default:
      printCronUsage();
      return;
  }
}

export async function runCliDaemonCommand(args: readonly string[], root = defaultConfigRoot()): Promise<void> {
  const command = args[0] ?? "status";
  switch (command) {
    case "run-once": {
      const result = await runDueCronJobs({ config: await loadConfig(root), configRoot: root });
      console.log(`cron run-once: ${result.completed} completed, ${result.failed} failed`);
      return;
    }
    case "run":
      await runCronDaemon(root, parseDaemonInterval(args.slice(1)));
      return;
    case "status":
      await printDaemonStatus(root);
      return;
    default:
      console.log("Usage: dream daemon status | run-once | run [--interval seconds]");
      return;
  }
}

async function createCronFromArgs(root: string, rawArgs: readonly string[], cwd: string): Promise<void> {
  const parsed = parseOptions(rawArgs);
  const text = parsed.args.join(" ");
  if (text.trim().length === 0) {
    console.log("Usage: dream cron add \"every day at 09:00 run tests\"");
    return;
  }
  const draft = parseCronDraft(text, cwd);
  const config = await loadConfig(root);
  const project = await findOrCreateProject(root, draft.projectName, cwd);
  const job = await createCronJob(root, {
    projectId: project.id,
    name: parsed.flags.get("name") ?? draftName(draft.prompt),
    schedule: parsed.flags.get("schedule") ?? draft.schedule,
    timezone: parsed.flags.get("timezone") ?? localTimezone(),
    prompt: parsed.flags.get("prompt") ?? draft.prompt,
    mode: parseMode(parsed.flags.get("mode") ?? draft.prompt),
    modelMode: parsed.flags.get("model") === "single" ? "single" : "auto",
    permissionMode: parsePermissionMode(parsed.flags.get("permission"), config.permissions.mode),
    notify: parsed.flags.get("notify") !== "false",
    outputPath: parsed.flags.get("output"),
  });
  console.log(`cron created: ${job.name} ${job.schedule} next ${job.nextRunAt ?? "paused"}`);
}

async function runCronByQuery(root: string, query: string): Promise<void> {
  if (query.trim().length === 0) {
    console.log("Usage: dream cron run <job>");
    return;
  }
  const job = await findCronJob(root, query.trim());
  const project = await findCronProject(root, job.projectId);
  const status = await runCronJob({
    config: await loadConfig(root),
    configRoot: root,
    job,
    project,
    now: new Date(),
    write: (chunk) => output.write(chunk),
  });
  console.log(`cron run: ${job.name} ${status}`);
}

async function setCronPaused(root: string, query: string, paused: boolean): Promise<void> {
  if (query.trim().length === 0) {
    console.log(`Usage: dream cron ${paused ? "pause" : "resume"} <job>`);
    return;
  }
  const job = await findCronJob(root, query.trim());
  const updated = await pauseCronJob(root, job.id, paused);
  console.log(`cron ${paused ? "paused" : "resumed"}: ${updated.name}`);
}

async function deleteCronByQuery(root: string, query: string): Promise<void> {
  if (query.trim().length === 0) {
    console.log("Usage: dream cron delete <job>");
    return;
  }
  const job = await findCronJob(root, query.trim());
  await deleteCronJob(root, job.id);
  console.log(`cron deleted: ${job.name}`);
}

async function renameCronJobByArgs(root: string, args: readonly string[]): Promise<void> {
  if (args.length < 2) {
    console.log("Usage: dream cron rename <job> <new name>");
    return;
  }
  const [query, ...nameParts] = args;
  if (query === undefined) {
    console.log("Usage: dream cron rename <job> <new name>");
    return;
  }
  const job = await findCronJob(root, query);
  const updated = await updateCronJob(root, job.id, { name: nameParts.join(" ") });
  console.log(`cron renamed: ${updated.name}`);
}

async function printCronList(root: string): Promise<void> {
  const projects = await listCronProjects(root);
  if (projects.length === 0) {
    console.log("Cron: no jobs");
    return;
  }
  for (const project of projects) {
    console.log(`${project.name} ${project.cwd}`);
    const jobs = await listCronJobs(root, project.id);
    for (const job of jobs) {
      console.log(formatJobLine(job));
    }
  }
}

async function printDaemonStatus(root: string): Promise<void> {
  const projects = await listCronProjects(root);
  const jobGroups = await Promise.all(projects.map((project) => listCronJobs(root, project.id)));
  const jobs = jobGroups.flat();
  const enabled = jobs.filter((job) => job.enabled).length;
  console.log(`daemon status: ${enabled}/${jobs.length} enabled cron job(s)`);
  console.log("run with: dream daemon run");
}

async function runCronDaemon(root: string, intervalMs: number): Promise<void> {
  const controller = new AbortController();
  process.once("SIGINT", () => {
    controller.abort();
  });
  process.once("SIGTERM", () => {
    controller.abort();
  });
  console.log(`dream daemon running every ${(intervalMs / 1000).toFixed(0)}s`);
  while (!controller.signal.aborted) {
    const result = await runDueCronJobs({ config: await loadConfig(root), configRoot: root });
    if (result.completed > 0 || result.failed > 0) {
      console.log(`cron tick: ${result.completed} completed, ${result.failed} failed`);
    }
    try {
      await sleep(intervalMs, undefined, { signal: controller.signal });
    } catch (error) {
      if (isAbortError(error)) {
        break;
      }
      throw error;
    }
  }
  console.log("dream daemon stopped");
}

async function findOrCreateProject(root: string, name: string, cwd: string): Promise<CronProject> {
  const projects = await listCronProjects(root);
  const existing = projects.find((project) => project.cwd === cwd);
  return existing ?? createCronProject(root, { name, cwd });
}
