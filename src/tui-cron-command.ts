import { basename } from "node:path";
import { stdout as output } from "node:process";

import { ansi, paint } from "./ansi.js";
import type { DreamConfig } from "./config.js";
import { parseCronDraft } from "./cron-schedule.js";
import {
  createCronJob,
  createCronProject,
  deleteCronJob,
  deleteCronProject,
  findCronJob,
  findCronProject,
  listCronJobs,
  listCronProjects,
  pauseCronJob,
  renameCronProject,
  updateCronJob,
} from "./cron-store.js";
import { runCronJob } from "./cron-runner.js";
import type { CronJob, CronProject } from "./cron-types.js";
import type { Questioner } from "./tui-workspace-commands.js";

export type RunCronCommandOptions = {
  readonly config: DreamConfig;
  readonly configRoot: string;
  readonly args: string;
  readonly questioner: Questioner;
  readonly cwd: string;
};

export async function runCronCommand(options: RunCronCommandOptions): Promise<void> {
  const args = options.args.trim();
  if (args.length === 0 || args === "list") {
    output.write(await formatCronOverview(options.configRoot));
    return;
  }
  if (args.startsWith("run ")) {
    await runCronFromTui(options, args.slice("run ".length));
    return;
  }
  if (args.startsWith("pause ")) {
    await setCronPaused(options.configRoot, args.slice("pause ".length), true);
    return;
  }
  if (args.startsWith("resume ")) {
    await setCronPaused(options.configRoot, args.slice("resume ".length), false);
    return;
  }
  if (args.startsWith("delete ") || args.startsWith("remove ")) {
    const query = args.replace(/^(?:delete|remove)\s+/u, "");
    await deleteCronByQuery(options.configRoot, query, options.questioner);
    return;
  }
  if (args.startsWith("rename ")) {
    await renameCronByArgs(options.configRoot, args.slice("rename ".length));
    return;
  }
  if (args.startsWith("project rename ")) {
    await renameCronProjectByArgs(options.configRoot, args.slice("project rename ".length));
    return;
  }
  if (args.startsWith("project delete ") || args.startsWith("project remove ")) {
    const query = args.replace(/^project\s+(?:delete|remove)\s+/u, "");
    await deleteCronProjectByQuery(options.configRoot, query, options.questioner);
    return;
  }

  const draft = parseCronDraft(args, options.cwd);
  output.write(formatCronDraft(draft.projectName, draft.schedule, draft.prompt, options.cwd));
  const answer = (await options.questioner.question("Create this cron job? ")).trim().toLowerCase();
  if (!["", "y", "yes", "create"].includes(answer)) {
    output.write("cron cancelled\n");
    return;
  }
  const project = await findOrCreateProject(options.configRoot, draft.projectName, options.cwd);
  const job = await createCronJob(options.configRoot, {
    projectId: project.id,
    name: sentenceName(draft.prompt),
    schedule: draft.schedule,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    prompt: draft.prompt,
    mode: commandMode(draft.prompt),
    modelMode: options.config.model.mode === "auto" ? "auto" : "single",
    permissionMode: options.config.permissions.mode,
    notify: options.config.notifications.enabled,
  });
  output.write(`${paint("cron created:", ansi.green)} ${job.name} ${paint(job.schedule, ansi.dim)}\n`);
}

async function runCronFromTui(options: RunCronCommandOptions, query: string): Promise<void> {
  const job = await findCronJob(options.configRoot, query.trim());
  const project = await findCronProject(options.configRoot, job.projectId);
  const status = await runCronJob({
    config: options.config,
    configRoot: options.configRoot,
    job,
    project,
    now: new Date(),
    write: (chunk) => output.write(chunk),
  });
  output.write(`${paint("cron run:", status === "completed" ? ansi.green : ansi.red)} ${job.name} ${paint(status, ansi.dim)}\n`);
}

async function setCronPaused(root: string, query: string, paused: boolean): Promise<void> {
  const job = await findCronJob(root, query.trim());
  const updated = await pauseCronJob(root, job.id, paused);
  output.write(`${paint(paused ? "cron paused:" : "cron resumed:", paused ? ansi.yellow : ansi.green)} ${updated.name}\n`);
}

async function deleteCronByQuery(root: string, query: string, questioner: Questioner): Promise<void> {
  const job = await findCronJob(root, query.trim());
  const answer = (await questioner.question(`Delete cron job "${job.name}"? `)).trim().toLowerCase();
  if (!["y", "yes", "delete"].includes(answer)) {
    output.write("cron delete cancelled\n");
    return;
  }
  await deleteCronJob(root, job.id);
  output.write(`${paint("cron deleted:", ansi.green)} ${job.name}\n`);
}

async function renameCronByArgs(root: string, args: string): Promise<void> {
  const [query, ...nameParts] = args.trim().split(/\s+/u);
  if (query === undefined || nameParts.length === 0) {
    output.write("usage: /cron rename <job> <new name>\n");
    return;
  }
  const job = await findCronJob(root, query);
  const updated = await updateCronJob(root, job.id, { name: nameParts.join(" ") });
  output.write(`${paint("cron renamed:", ansi.green)} ${updated.name}\n`);
}

async function renameCronProjectByArgs(root: string, args: string): Promise<void> {
  const [query, ...nameParts] = args.trim().split(/\s+/u);
  if (query === undefined || nameParts.length === 0) {
    output.write("usage: /cron project rename <project> <new name>\n");
    return;
  }
  const project = await findCronProject(root, query);
  const renamed = await renameCronProject(root, project.id, nameParts.join(" "));
  output.write(`${paint("cron project renamed:", ansi.green)} ${renamed.name}\n`);
}

async function deleteCronProjectByQuery(root: string, query: string, questioner: Questioner): Promise<void> {
  const project = await findCronProject(root, query.trim());
  const answer = (await questioner.question(`Delete cron project "${project.name}" and its jobs? `)).trim().toLowerCase();
  if (!["y", "yes", "delete"].includes(answer)) {
    output.write("cron project delete cancelled\n");
    return;
  }
  await deleteCronProject(root, project.id);
  output.write(`${paint("cron project deleted:", ansi.green)} ${project.name}\n`);
}

async function findOrCreateProject(root: string, name: string, cwd: string): Promise<CronProject> {
  const projects = await listCronProjects(root);
  const existing = projects.find((project) => project.cwd === cwd);
  return existing ?? createCronProject(root, { name, cwd });
}

async function formatCronOverview(root: string): Promise<string> {
  const projects = await listCronProjects(root);
  if (projects.length === 0) {
    return [
      `${paint("Cron", `${ansi.bold}${ansi.accent}`)}`,
      `${paint("No cron jobs yet.", ansi.muted)}`,
      `${paint("Try:", ansi.dim)} /cron every day at 09:00 run tests and summarize failures`,
      "",
    ].join("\n");
  }
  const lines = [`${paint("Cron", `${ansi.bold}${ansi.accent}`)}`];
  for (const project of projects) {
    const jobs = await listCronJobs(root, project.id);
    lines.push(`${paint(project.name, ansi.blue)} ${paint(`${jobs.length} job(s)`, ansi.dim)} ${project.cwd}`);
    lines.push(...jobs.map(formatJobLine));
  }
  return `${lines.join("\n")}\n`;
}

function formatJobLine(job: CronJob): string {
  const state = job.enabled ? paint("[v]", ansi.green) : paint("[ ]", ansi.yellow);
  const nextRun = job.nextRunAt === undefined ? "paused" : job.nextRunAt;
  return `  ${state} ${job.name} ${paint(job.schedule, ansi.dim)} ${paint(nextRun, ansi.muted)}\n    ${job.prompt}`;
}

function formatCronDraft(projectName: string, schedule: string, prompt: string, cwd: string): string {
  return [
    `${paint("Cron draft", `${ansi.bold}${ansi.accent}`)}`,
    `Project: ${paint(projectName, ansi.blue)}`,
    `Directory: ${paint(cwd, ansi.blue)}`,
    `Schedule: ${paint(schedule, ansi.yellow)}`,
    `Prompt: ${prompt}`,
    `Output: ${paint("Dream history only", ansi.dim)}`,
    "",
  ].join("\n");
}

function sentenceName(prompt: string): string {
  const normalized = prompt.trim().replace(/\s+/gu, " ");
  const firstWords = normalized.split(" ").slice(0, 5).join(" ");
  return titleCase(firstWords.length === 0 ? basename(process.cwd()) : firstWords);
}

function titleCase(value: string): string {
  return value.replace(/\b\p{L}/gu, (letter) => letter.toLocaleUpperCase());
}

function commandMode(prompt: string): "agent" | "workflow" | "swarm" {
  const trimmed = prompt.trim();
  if (trimmed.startsWith("/workflow")) {
    return "workflow";
  }
  if (trimmed.startsWith("/swarm")) {
    return "swarm";
  }
  return "agent";
}
