import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { CronJob, CronProject } from "./cron-types.js";
import { runLoopSpec, type LoopAgentRunner, type LoopRunResult } from "./loop-engine.js";
import { saveLoopRun } from "./loop-runs.js";
import { parseLoopSpec } from "./loop-spec.js";

export type CronLoopAgentRunner = (input: {
  readonly prompt: string;
  readonly cwd: string;
  readonly job: CronJob;
}) => Promise<string>;

export type RunCronLoopInput = {
  readonly configRoot: string;
  readonly job: CronJob;
  readonly project: CronProject;
  readonly runAgent: CronLoopAgentRunner;
};

export async function runCronLoopJob(input: RunCronLoopInput): Promise<string> {
  if (input.job.permissionMode !== "yolo") {
    throw new Error("Loop cron jobs require yolo permission mode before evaluator commands can run.");
  }
  const specPath = loopSpecPath(input.job.prompt);
  const filePath = resolve(input.project.cwd, specPath);
  const spec = parseLoopSpec(await readFile(filePath, "utf8"));
  const result = await runLoopSpec({
    workspace: input.project.cwd,
    spec,
    runAgent: cronLoopAgent(input),
  });
  await saveLoopRun(input.configRoot, {
    specPath: filePath,
    workspace: input.project.cwd,
    spec,
    result,
  });
  return formatCronLoopResult(result);
}

function cronLoopAgent(input: RunCronLoopInput): LoopAgentRunner {
  return (agentInput) => input.runAgent({
    prompt: agentInput.prompt,
    cwd: input.project.cwd,
    job: input.job,
  });
}

function loopSpecPath(prompt: string): string {
  const path = prompt.replace(/^\/loop\s*/u, "").trim();
  if (path.length === 0) {
    throw new Error("Loop cron jobs need a loop spec path.");
  }
  return path;
}

function formatCronLoopResult(result: LoopRunResult): string {
  const suffix = result.status === "failed" ? `: ${result.error}` : "";
  return `loop ${result.status}: ${result.turns} turn${result.turns === 1 ? "" : "s"}${suffix}`;
}
