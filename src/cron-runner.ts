import { stdout as output } from "node:process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { stripAnsi } from "./ansi.js";
import { runAgentPrompt } from "./agent-runner.js";
import type { DreamConfig } from "./config.js";
import { createCronRun, listCronProjects, loadDueCronJobs, updateCronJob } from "./cron-store.js";
import { saveCronArtifact } from "./cron-artifacts.js";
import type { CronJob, CronProject } from "./cron-types.js";
import { notifyCronComplete } from "./notifications.js";
import { runCronLoopJob } from "./cron-loop-runner.js";
import { oneLine, parseSwarmPrompt, renderWorkflowCronResult, writeCronOutput } from "./cron-runner-utils.js";
import { runAgentSwarm } from "./swarm-runner.js";
import { runWorkflowScript } from "./workflow-engine.js";

export type CronAgentRunner = (input: {
  readonly prompt: string;
  readonly cwd: string;
  readonly job: CronJob;
}) => Promise<string>;

export type RunDueCronJobsInput = {
  readonly config: DreamConfig;
  readonly configRoot: string;
  readonly now?: Date;
  readonly runAgent?: CronAgentRunner;
  readonly write?: (chunk: string) => boolean;
};

export type RunDueCronJobsResult = {
  readonly completed: number;
  readonly failed: number;
};

export async function runDueCronJobs(input: RunDueCronJobsInput): Promise<RunDueCronJobsResult> {
  const now = input.now ?? new Date();
  const jobs = await loadDueCronJobs(input.configRoot, now);
  const projects = new Map((await listCronProjects(input.configRoot)).map((project) => [project.id, project]));
  let completed = 0;
  let failed = 0;

  for (const job of jobs) {
    const project = projects.get(job.projectId);
    if (project === undefined) {
      failed += 1;
      continue;
    }
    const status = await runCronJob({ ...input, job, project, now });
    if (status === "completed") {
      completed += 1;
    } else {
      failed += 1;
    }
  }

  return { completed, failed };
}

export async function runCronJob(input: RunDueCronJobsInput & {
  readonly job: CronJob;
  readonly project: CronProject;
  readonly now: Date;
}): Promise<"completed" | "failed"> {
  const startedAt = input.now.toISOString();
  const runAgent = input.runAgent ?? defaultCronAgentRunner(input.config, input.configRoot, input.write ?? ((chunk) => output.write(chunk)));
  try {
    const result = await executeCronJob(input.job, input.project, runAgent, input.config, input.configRoot, input.write ?? ((chunk) => output.write(chunk)));
    const finishedAt = new Date().toISOString();
    const outputPath = await writeCronOutput(input.job, input.project, result);
    const artifactPath = await saveCronArtifact(input.configRoot, {
      project: input.project,
      job: input.job,
      status: "completed",
      startedAt,
      finishedAt,
      result,
    });
    await createCronRun(input.configRoot, {
      jobId: input.job.id,
      status: "completed",
      startedAt,
      finishedAt,
      summary: oneLine(result),
      artifactPath,
      outputPath,
      error: undefined,
    });
    await updateCronJob(input.configRoot, input.job.id, { lastRunAt: finishedAt, nextRunAt: undefined }, new Date(finishedAt));
    if (input.job.notify) {
      await notifyCronComplete(input.config, input.job.name, "completed");
    }
    return "completed";
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown cron failure";
    const finishedAt = new Date().toISOString();
    const artifactPath = await saveCronArtifact(input.configRoot, {
      project: input.project,
      job: input.job,
      status: "failed",
      startedAt,
      finishedAt,
      result: "",
      error: message,
    });
    await createCronRun(input.configRoot, {
      jobId: input.job.id,
      status: "failed",
      startedAt,
      finishedAt,
      summary: message,
      artifactPath,
      outputPath: input.job.outputPath,
      error: message,
    });
    await updateCronJob(input.configRoot, input.job.id, { lastRunAt: finishedAt, nextRunAt: undefined }, new Date(finishedAt));
    if (input.job.notify) {
      await notifyCronComplete(input.config, input.job.name, "failed");
    }
    return "failed";
  }
}

async function executeCronJob(
  job: CronJob,
  project: CronProject,
  runAgent: CronAgentRunner,
  config: DreamConfig,
  configRoot: string,
  write: (chunk: string) => boolean,
): Promise<string> {
  if (job.mode === "swarm" || job.prompt.trim().startsWith("/swarm")) {
    const swarmArgs = parseSwarmPrompt(job.prompt);
    const summary = await runAgentSwarm({
      config,
      configRoot,
      cwd: project.cwd,
      goal: swarmArgs.goal,
      write: (chunk) => {
        write(chunk);
      },
      replaceMonitor: false,
      synthesisMode: "auto",
      ...(swarmArgs.forceLanes === undefined ? {} : { forceLanes: swarmArgs.forceLanes }),
      ...(swarmArgs.intensity === undefined ? {} : { intensity: swarmArgs.intensity }),
    });
    return summary.synthesis;
  }
  if (job.mode === "workflow" || job.prompt.trim().startsWith("/workflow")) {
    const scriptPath = job.prompt.replace(/^\/workflow\s*/u, "").trim();
    if (scriptPath.length === 0) {
      throw new Error("Workflow cron jobs need a workflow file path.");
    }
    const filePath = resolve(project.cwd, scriptPath);
    const script = await readFile(filePath, "utf8");
    const result = await runWorkflowScript({
      root: configRoot,
      workspace: project.cwd,
      script,
      runAgent: (prompt) => runAgent({ prompt, cwd: project.cwd, job }),
    });
    if (result.status === "failed") {
      throw new Error(result.error);
    }
    return renderWorkflowCronResult(result.value, result.events, result.durationMs);
  }
  if (job.mode === "loop" || job.prompt.trim().startsWith("/loop")) {
    return runCronLoopJob({ configRoot, job, project, runAgent });
  }
  return runAgent({ prompt: job.prompt, cwd: project.cwd, job });
}

function defaultCronAgentRunner(
  config: DreamConfig,
  configRoot: string,
  write: (chunk: string) => boolean,
): CronAgentRunner {
  return async (input) => {
    let transcript = "";
    await runAgentPrompt({
      config,
      configRoot,
      prompt: input.prompt,
      cwd: input.cwd,
      runLabel: `Cron ${input.job.name}`,
      write: (chunk) => {
        transcript = `${transcript}${stripAnsi(chunk)}`;
        write(chunk);
      },
    });
    return transcript.trim();
  };
}
