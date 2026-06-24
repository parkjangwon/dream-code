import type { AgentRunRecord } from "./agent-run-record.js";
import { readAgentRunState, readPersistedAgentRuns } from "./agent-run-persisted.js";
import { redactJsonSecrets } from "./redaction.js";

export async function formatAgentRunResumeJson(root: string, runId: string): Promise<string> {
  const run = await readRun(root, runId);
  if (run === undefined) {
    return `${JSON.stringify({ error: `run not found: ${runId}` })}\n`;
  }
  return `${JSON.stringify(redactJsonSecrets(resumePackage(run)), undefined, 2)}\n`;
}

async function readRun(root: string, runId: string): Promise<AgentRunRecord | undefined> {
  if (runId !== "latest") {
    return readAgentRunState(root, runId);
  }
  const runs = await readPersistedAgentRuns(root);
  return [...runs].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
}

function resumePackage(run: AgentRunRecord): object {
  const failedTools = run.toolEvents.filter((event) => !event.ok);
  const lastFailure = failedTools.at(-1);
  const recovery = lastFailure?.recovery ?? run.resumeHint ?? "Inspect the run output and continue from the last safe prompt.";
  const nextCommand = `dream runs show ${run.id} --json`;
  return {
    title: "Dream Run Resume",
    runId: run.id,
    status: run.status,
    prompt: run.prompt,
    changedFiles: run.changedFiles,
    toolCalls: run.toolCalls,
    outputPath: run.outputPath,
    ...(run.error === undefined ? {} : { error: run.error }),
    failureClass: lastFailure?.failureClass ?? "none",
    recovery,
    nextCommand,
    replay: {
      prompt: run.prompt,
      ...(lastFailure?.label === undefined ? {} : { failedTool: lastFailure.label }),
      recovery,
      ...(lastFailure?.nextAction === undefined ? {} : { nextAction: lastFailure.nextAction }),
    },
  };
}
