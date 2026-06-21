import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { z } from "zod";

import type { CronJob, CronProject, CronRun } from "./cron-types.js";

export const projectRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  cwd: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const jobRowSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  name: z.string(),
  schedule: z.string(),
  timezone: z.string(),
  prompt: z.string(),
  mode: z.enum(["agent", "workflow", "swarm"]),
  enabled: z.number(),
  model_mode: z.enum(["auto", "single"]),
  permission_mode: z.enum(["ask", "auto", "plan", "yolo"]),
  notify: z.number(),
  output_path: z.string().nullable(),
  last_run_at: z.string().nullable(),
  next_run_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const runRowSchema = z.object({
  id: z.string(),
  job_id: z.string(),
  project_id: z.string(),
  status: z.enum(["completed", "failed", "blocked", "cancelled"]),
  started_at: z.string(),
  finished_at: z.string(),
  summary: z.string(),
  artifact_path: z.string().nullable(),
  output_path: z.string().nullable(),
  error: z.string().nullable(),
});

type ProjectRow = z.infer<typeof projectRowSchema>;
type JobRow = z.infer<typeof jobRowSchema>;
type RunRow = z.infer<typeof runRowSchema>;

export function cronStorePath(root: string): string {
  return join(root, "dream.db");
}

export async function withCronDb<T>(root: string, action: (db: DatabaseSync) => T): Promise<T> {
  await mkdir(dirname(cronStorePath(root)), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(cronStorePath(root));
  try {
    db.exec(schemaSql());
    return action(db);
  } finally {
    db.close();
  }
}

export function insertCronJob(db: DatabaseSync, job: CronJob): void {
  db.prepare([
    "insert into cron_jobs (id, project_id, name, schedule, timezone, prompt, mode, enabled, model_mode, permission_mode, notify, output_path, last_run_at, next_run_at, created_at, updated_at)",
    "values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ].join(" ")).run(
    job.id,
    job.projectId,
    job.name,
    job.schedule,
    job.timezone,
    job.prompt,
    job.mode,
    job.enabled ? 1 : 0,
    job.modelMode,
    job.permissionMode,
    job.notify ? 1 : 0,
    job.outputPath ?? null,
    job.lastRunAt ?? null,
    job.nextRunAt ?? null,
    job.createdAt,
    job.updatedAt,
  );
}

export function projectFromRow(row: ProjectRow): CronProject {
  return { id: row.id, name: row.name, cwd: row.cwd, createdAt: row.created_at, updatedAt: row.updated_at };
}

export function jobFromRow(row: JobRow): CronJob {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    schedule: row.schedule,
    timezone: row.timezone,
    prompt: row.prompt,
    mode: row.mode,
    enabled: row.enabled === 1,
    modelMode: row.model_mode,
    permissionMode: row.permission_mode,
    notify: row.notify === 1,
    ...(row.output_path === null ? {} : { outputPath: row.output_path }),
    ...(row.last_run_at === null ? {} : { lastRunAt: row.last_run_at }),
    ...(row.next_run_at === null ? {} : { nextRunAt: row.next_run_at }),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function runFromRow(row: RunRow): CronRun {
  return {
    id: row.id,
    jobId: row.job_id,
    projectId: row.project_id,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    summary: row.summary,
    ...(row.artifact_path === null ? {} : { artifactPath: row.artifact_path }),
    ...(row.output_path === null ? {} : { outputPath: row.output_path }),
    ...(row.error === null ? {} : { error: row.error }),
  };
}

function schemaSql(): string {
  return [
    "create table if not exists cron_projects (id text primary key, name text not null, cwd text not null, created_at text not null, updated_at text not null)",
    "create table if not exists cron_jobs (id text primary key, project_id text not null, name text not null, schedule text not null, timezone text not null, prompt text not null, mode text not null, enabled integer not null, model_mode text not null, permission_mode text not null, notify integer not null, output_path text, last_run_at text, next_run_at text, created_at text not null, updated_at text not null)",
    "create table if not exists cron_runs (id text primary key, job_id text not null, project_id text not null, status text not null, started_at text not null, finished_at text not null, summary text not null, artifact_path text, output_path text, error text)",
  ].join("; ");
}
