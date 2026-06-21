import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { CronJob, CronProject, CronRunStatus } from "./cron-types.js";

export type CronArtifactInput = {
  readonly project: CronProject;
  readonly job: CronJob;
  readonly status: CronRunStatus;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly result: string;
  readonly error?: string;
};

export async function saveCronArtifact(root: string, input: CronArtifactInput): Promise<string> {
  const dir = join(root, "cron", "runs", safeSegment(input.project.name), safeSegment(input.job.name));
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const filePath = join(dir, `${input.startedAt.replace(/[:.]/gu, "-")}.md`);
  await writeFile(filePath, renderCronArtifact(input), "utf8");
  return filePath;
}

function renderCronArtifact(input: CronArtifactInput): string {
  return [
    `# ${input.job.name}`,
    "",
    `Status: ${input.status}`,
    `Project: ${input.project.name}`,
    `Started: ${input.startedAt}`,
    `Finished: ${input.finishedAt}`,
    `Schedule: ${input.job.schedule}`,
    `Mode: ${input.job.mode}`,
    "",
    "## Prompt",
    "",
    input.job.prompt,
    "",
    "## Result",
    "",
    input.result.trim(),
    ...(input.error === undefined ? [] : ["", "## Error", "", input.error]),
    "",
  ].join("\n");
}

function safeSegment(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9._-]+/gu, "-").replace(/^-+|-+$/gu, "");
  return normalized.length === 0 ? "cron" : normalized;
}

