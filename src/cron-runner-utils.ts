import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

import { parseSwarmArgs, type SwarmArgs } from "./swarm-args.js";
import type { CronJob, CronProject } from "./cron-types.js";
import type { WorkflowRunEvent } from "./workflow-engine.js";

export function oneLine(value: string): string {
  const normalized = value.trim().replace(/\s+/gu, " ");
  return normalized.length > 160 ? `${normalized.slice(0, 157)}...` : normalized;
}

export async function writeCronOutput(job: CronJob, project: CronProject, result: string): Promise<string | undefined> {
  if (job.outputPath === undefined) {
    return undefined;
  }
  const filePath = workspaceOutputPath(project.cwd, job.outputPath);
  if (filePath === undefined) {
    throw new Error(`Cron output path must stay inside the project: ${job.outputPath}`);
  }
  await mkdir(dirname(filePath), { recursive: true, mode: 0o700 });
  await writeFile(filePath, `${result.trim()}\n`, "utf8");
  return filePath;
}

export function parseSwarmPrompt(prompt: string): SwarmArgs {
  const text = prompt.replace(/^\/swarm\s*/u, "").trim();
  const parsed = parseSwarmArgs(text);
  if (parsed.goal.length === 0) {
    throw new Error("Swarm cron jobs need a goal.");
  }
  return parsed;
}

export function renderWorkflowCronResult(
  value: unknown,
  events: readonly WorkflowRunEvent[],
  durationMs: number,
): string {
  const outputValue = typeof value === "string" ? value : JSON.stringify(value, null, 2) ?? "null";
  const completed = events.filter((event) => event.status === "done").length;
  const failed = events.filter((event) => event.status === "failed").length;
  return [
    outputValue,
    "",
    `Workflow trace: ${completed} done, ${failed} failed, ${(durationMs / 1000).toFixed(1)}s`,
    ...events.filter((event) => event.status !== "started").slice(-8).map((event) => {
      const status = event.status.toUpperCase().padEnd(6);
      return `- ${status} ${event.type} ${event.label}`;
    }),
  ].join("\n").trim();
}

function workspaceOutputPath(cwd: string, path: string): string | undefined {
  if (isAbsolute(path)) {
    return undefined;
  }
  const filePath = resolve(cwd, path);
  const rel = relative(cwd, filePath);
  return rel.startsWith("..") || isAbsolute(rel) ? undefined : filePath;
}
