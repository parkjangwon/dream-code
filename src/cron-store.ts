import { randomUUID } from "node:crypto";
import { z } from "zod";

import {
  cronStorePath,
  insertCronJob,
  jobFromRow,
  jobRowSchema,
  projectFromRow,
  projectRowSchema,
  runFromRow,
  runRowSchema,
  withCronDb,
} from "./cron-db.js";
import type {
  CronJob,
  CronJobInput,
  CronJobPatch,
  CronProject,
  CronProjectInput,
  CronRun,
  CronRunInput,
} from "./cron-types.js";
import {
  buildCronJob,
  CronStoreError,
  definedPatch,
  normalizeNextRun,
  singleMatch,
} from "./cron-store-utils.js";

export { cronStorePath };
export { CronStoreError } from "./cron-store-utils.js";

export async function createCronProject(root: string, input: CronProjectInput): Promise<CronProject> {
  const now = new Date().toISOString();
  const project: CronProject = { id: randomUUID(), name: input.name.trim(), cwd: input.cwd, createdAt: now, updatedAt: now };
  await withCronDb(root, (db) => {
    db.prepare("insert into cron_projects (id, name, cwd, created_at, updated_at) values (?, ?, ?, ?, ?)")
      .run(project.id, project.name, project.cwd, project.createdAt, project.updatedAt);
  });
  return project;
}

export async function renameCronProject(root: string, projectId: string, name: string): Promise<CronProject> {
  const now = new Date().toISOString();
  await withCronDb(root, (db) => {
    db.prepare("update cron_projects set name = ?, updated_at = ? where id = ?").run(name.trim(), now, projectId);
  });
  const project = await getCronProject(root, projectId);
  if (project === undefined) {
    throw new CronStoreError(`Cron project not found: ${projectId}`);
  }
  return project;
}

export async function deleteCronProject(root: string, projectId: string): Promise<CronProject> {
  const deleted = await getCronProject(root, projectId);
  if (deleted === undefined) {
    throw new CronStoreError(`Cron project not found: ${projectId}`);
  }
  await withCronDb(root, (db) => {
    db.prepare("delete from cron_runs where project_id = ?").run(projectId);
    db.prepare("delete from cron_jobs where project_id = ?").run(projectId);
    db.prepare("delete from cron_projects where id = ?").run(projectId);
  });
  return deleted;
}

export async function listCronProjects(root: string): Promise<readonly CronProject[]> {
  return withCronDb(root, (db) => {
    const rows = z.array(projectRowSchema).parse(db.prepare("select * from cron_projects order by name asc").all());
    return rows.map(projectFromRow);
  });
}

export async function findCronProject(root: string, query: string): Promise<CronProject> {
  const needle = query.trim().toLowerCase();
  const projects = await listCronProjects(root);
  const matches = projects.filter((project) => {
    const name = project.name.toLowerCase();
    return project.id === query || name === needle || name.startsWith(needle) || project.cwd === query;
  });
  const match = singleMatch(matches, "Cron project", query);
  return match;
}

export async function createCronJob(root: string, input: CronJobInput, now = new Date()): Promise<CronJob> {
  const project = await getCronProject(root, input.projectId);
  if (project === undefined) {
    throw new CronStoreError(`Cron project not found: ${input.projectId}`);
  }
  const timestamp = new Date().toISOString();
  const job = buildCronJob(input, timestamp, now);
  await withCronDb(root, (db) => insertCronJob(db, job));
  return job;
}

export async function updateCronJob(root: string, jobId: string, patch: CronJobPatch, now = new Date()): Promise<CronJob> {
  const current = await getCronJob(root, jobId);
  if (current === undefined) {
    throw new CronStoreError(`Cron job not found: ${jobId}`);
  }
  const updated = normalizeNextRun({ ...current, ...definedPatch(patch), updatedAt: new Date().toISOString() }, now);
  await withCronDb(root, (db) => {
    db.prepare([
      "update cron_jobs set name = ?, schedule = ?, timezone = ?, prompt = ?, mode = ?, enabled = ?,",
      "model_mode = ?, permission_mode = ?, notify = ?, output_path = ?, last_run_at = ?, next_run_at = ?, updated_at = ? where id = ?",
    ].join(" ")).run(
      updated.name,
      updated.schedule,
      updated.timezone,
      updated.prompt,
      updated.mode,
      updated.enabled ? 1 : 0,
      updated.modelMode,
      updated.permissionMode,
      updated.notify ? 1 : 0,
      updated.outputPath ?? null,
      updated.lastRunAt ?? null,
      updated.nextRunAt ?? null,
      updated.updatedAt,
      updated.id,
    );
  });
  return updated;
}

export async function deleteCronJob(root: string, jobId: string): Promise<CronJob> {
  const deleted = await getCronJob(root, jobId);
  if (deleted === undefined) {
    throw new CronStoreError(`Cron job not found: ${jobId}`);
  }
  await withCronDb(root, (db) => db.prepare("delete from cron_jobs where id = ?").run(jobId));
  return deleted;
}

export async function pauseCronJob(root: string, jobId: string, paused: boolean): Promise<CronJob> {
  return updateCronJob(root, jobId, { enabled: !paused });
}

export async function listCronJobs(root: string, projectId?: string): Promise<readonly CronJob[]> {
  return withCronDb(root, (db) => {
    const statement = projectId === undefined
      ? db.prepare("select * from cron_jobs order by name asc")
      : db.prepare("select * from cron_jobs where project_id = ? order by name asc");
    const rows = z.array(jobRowSchema).parse(projectId === undefined ? statement.all() : statement.all(projectId));
    return rows.map(jobFromRow);
  });
}

export async function findCronJob(root: string, query: string): Promise<CronJob> {
  const needle = query.trim().toLowerCase();
  const jobs = await listCronJobs(root);
  const matches = jobs.filter((job) => {
    const name = job.name.toLowerCase();
    return job.id === query || name === needle || name.startsWith(needle);
  });
  return singleMatch(matches, "Cron job", query);
}

export async function loadDueCronJobs(root: string, now = new Date()): Promise<readonly CronJob[]> {
  const timestamp = now.toISOString();
  return withCronDb(root, (db) => {
    const rows = z.array(jobRowSchema).parse(db.prepare([
      "select * from cron_jobs where enabled = 1 and next_run_at is not null and next_run_at <= ?",
      "order by next_run_at asc",
    ].join(" ")).all(timestamp));
    return rows.map(jobFromRow);
  });
}

export async function recordCronRun(root: string, input: CronRunInput): Promise<CronRun> {
  const run: CronRun = { id: randomUUID(), ...input };
  await withCronDb(root, (db) => {
    db.prepare([
      "insert into cron_runs (id, job_id, project_id, status, started_at, finished_at, summary, artifact_path, output_path, error)",
      "values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ].join(" ")).run(
      run.id,
      run.jobId,
      run.projectId,
      run.status,
      run.startedAt,
      run.finishedAt,
      run.summary,
      run.artifactPath ?? null,
      run.outputPath ?? null,
      run.error ?? null,
    );
  });
  return run;
}

export async function createCronRun(root: string, input: Omit<CronRunInput, "projectId">): Promise<CronRun> {
  const job = await getCronJob(root, input.jobId);
  if (job === undefined) {
    throw new CronStoreError(`Cron job not found: ${input.jobId}`);
  }
  return recordCronRun(root, { ...input, projectId: job.projectId });
}

export async function listCronRuns(root: string, jobId?: string): Promise<readonly CronRun[]> {
  return withCronDb(root, (db) => {
    const statement = jobId === undefined
      ? db.prepare("select * from cron_runs order by started_at desc")
      : db.prepare("select * from cron_runs where job_id = ? order by started_at desc");
    const rows = z.array(runRowSchema).parse(jobId === undefined ? statement.all() : statement.all(jobId));
    return rows.map(runFromRow);
  });
}

async function getCronProject(root: string, projectId: string): Promise<CronProject | undefined> {
  return withCronDb(root, (db) => {
    const row = projectRowSchema.nullable().parse(db.prepare("select * from cron_projects where id = ?").get(projectId) ?? null);
    return row === null ? undefined : projectFromRow(row);
  });
}

async function getCronJob(root: string, jobId: string): Promise<CronJob | undefined> {
  return withCronDb(root, (db) => {
    const row = jobRowSchema.nullable().parse(db.prepare("select * from cron_jobs where id = ?").get(jobId) ?? null);
    return row === null ? undefined : jobFromRow(row);
  });
}
