import { randomUUID } from "node:crypto";

import { nextCronRunAt } from "./cron-schedule.js";
import type { CronJob, CronJobInput, CronJobPatch } from "./cron-types.js";

export function buildCronJob(input: CronJobInput, timestamp: string, now: Date): CronJob {
  const job: CronJob = {
    id: randomUUID(),
    projectId: input.projectId,
    name: input.name,
    schedule: input.schedule,
    timezone: input.timezone,
    prompt: input.prompt,
    mode: input.mode ?? "agent",
    enabled: input.enabled ?? true,
    modelMode: input.modelMode,
    permissionMode: input.permissionMode,
    notify: input.notify,
    ...(input.outputPath === undefined ? {} : { outputPath: input.outputPath }),
    ...(input.nextRunAt === undefined ? {} : { nextRunAt: input.nextRunAt }),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  return input.nextRunAt === undefined ? normalizeNextRun(job, now) : job;
}

export function normalizeNextRun(job: CronJob, now: Date): CronJob {
  if (!job.enabled) {
    const { nextRunAt: _nextRunAt, ...rest } = job;
    return rest;
  }
  if (job.nextRunAt !== undefined && job.nextRunAt > now.toISOString()) {
    return job;
  }
  return { ...job, nextRunAt: nextCronRunAt(job.schedule, now) };
}

export function definedPatch(patch: CronJobPatch): CronJobPatch {
  return Object.fromEntries(Object.entries(patch).filter((entry) => entry[1] !== undefined));
}

export function singleMatch<T>(matches: readonly T[], label: string, query: string): T {
  if (matches.length === 1) {
    const [match] = matches;
    if (match !== undefined) {
      return match;
    }
  }
  if (matches.length === 0) {
    throw new CronStoreError(`${label} not found: ${query}`);
  }
  throw new CronStoreError(`${label} is ambiguous: ${query}`);
}

export class CronStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CronStoreError";
  }
}
