import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { WorkflowRunEvent } from "./workflow-engine.js";

export type WorkflowRunStatus = "done" | "failed";

export type SaveWorkflowRunInput = {
  readonly scriptPath: string;
  readonly workspace: string;
  readonly status: WorkflowRunStatus;
  readonly durationMs: number;
  readonly events: readonly WorkflowRunEvent[];
  readonly value?: unknown;
  readonly error?: string;
};

export async function saveWorkflowRun(root: string, input: SaveWorkflowRunInput): Promise<string> {
  const startedAt = new Date().toISOString();
  const filePath = join(workflowRunsRoot(root), `${runId(startedAt)}.json`);
  await mkdir(workflowRunsRoot(root), { recursive: true, mode: 0o700 });
  await writeFile(filePath, `${JSON.stringify({ version: 1, startedAt, ...input }, null, 2)}\n`, "utf8");
  return filePath;
}

function workflowRunsRoot(root: string): string {
  return join(root, "workflows", "runs");
}

function runId(timestamp: string): string {
  return `workflow_${timestamp.replace(/[-:.]/gu, "")}_${Math.random().toString(36).slice(2, 8)}`;
}
