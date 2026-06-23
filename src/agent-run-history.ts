import { copyFile, mkdir, readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { AgentRunCheckpoint, AgentRunRecord } from "./agent-run-record.js";
import { agentRunsRoot, parseAgentRunRecord } from "./agent-run-record.js";
import { saveFileCheckpoint } from "./file-history.js";

export async function formatAgentRunShow(root: string, runId: string): Promise<string> {
  const run = await readRun(root, runId);
  if (run === undefined) {
    return `run not found: ${runId}\n`;
  }
  return [
    `Run ${run.id}`,
    `status: ${run.status}`,
    `prompt: ${run.prompt}`,
    ...(run.error === undefined ? [] : [`error: ${run.error}`]),
    `tool calls: ${run.toolCalls}`,
    `changed files: ${run.changedFiles.length === 0 ? "none" : run.changedFiles.join(", ")}`,
    `checkpoints: ${run.checkpoints.length}`,
    "",
  ].join("\n");
}

export async function formatAgentRunDiff(root: string, runId: string, workspaceRoot?: string): Promise<string> {
  const run = await readRun(root, runId);
  if (run === undefined) {
    return `run not found: ${runId}\n`;
  }
  const diffs = await Promise.all(oldestCheckpointPerPath(run.checkpoints).map((checkpoint) => diffCheckpoint(checkpoint, workspaceRoot)));
  return [
    `Run ${run.id} ${run.status}`,
    `prompt: ${run.prompt}`,
    ...(run.error === undefined ? [] : [`error: ${run.error}`]),
    ...(diffs.length === 0 ? ["no checkpointed changes"] : diffs),
    "",
  ].join("\n");
}

export async function formatAgentRunResumeContext(root: string, runId: string): Promise<string> {
  const run = await readRun(root, runId);
  if (run === undefined) {
    return `Run ${runId} was not found.`;
  }
  return [
    `Resume run ${run.id}`,
    `status: ${run.status}`,
    `prompt: ${run.prompt}`,
    ...(run.error === undefined ? [] : [`last error: ${run.error}`]),
    `tool calls: ${run.toolCalls}`,
    `changed files: ${run.changedFiles.length === 0 ? "none" : run.changedFiles.join(", ")}`,
    `output: ${run.outputPath}`,
  ].join("\n");
}

export async function revertAgentRun(root: string, runId: string, workspaceRoot?: string): Promise<string> {
  const result = await revertAgentRunChanges(root, runId, workspaceRoot);
  return `reverted ${result.runId}: ${result.revertedPaths.join(", ")}\n`;
}

export async function revertAgentRunChanges(
  root: string,
  runId: string,
  workspaceRoot?: string,
): Promise<{ readonly runId: string; readonly revertedPaths: readonly string[] }> {
  const run = await readRun(root, runId);
  if (run === undefined) {
    throw new Error(`Run not found: ${runId}`);
  }
  const revertedPaths: string[] = [];
  for (const checkpoint of oldestCheckpointPerPath(run.checkpoints)) {
    await saveFileCheckpoint(checkpoint.path, workspaceRoot ?? checkpoint.workspaceRoot, root);
    const target = join(workspaceRoot ?? checkpoint.workspaceRoot, checkpoint.path);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(checkpoint.snapshotPath, target);
    revertedPaths.push(target);
  }
  return { runId: run.id, revertedPaths };
}

async function readRun(root: string, runId: string): Promise<AgentRunRecord | undefined> {
  if (runId === "latest") {
    return readLatestRun(root);
  }
  return readRunState(join(agentRunsRoot(root), runId, "state.json"));
}

async function readLatestRun(root: string): Promise<AgentRunRecord | undefined> {
  let entries: readonly import("node:fs").Dirent[];
  try {
    entries = await readdir(agentRunsRoot(root), { withFileTypes: true });
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
  const runs = (await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => readRunState(join(agentRunsRoot(root), entry.name, "state.json"))),
  )).filter(isAgentRunRecord);
  return runs.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
}

async function readRunState(path: string): Promise<AgentRunRecord | undefined> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    return parseAgentRunRecord(parsed);
  } catch (error) {
    if (error instanceof SyntaxError || (isErrnoException(error) && error.code === "ENOENT")) {
      return undefined;
    }
    throw error;
  }
}

async function diffCheckpoint(checkpoint: AgentRunCheckpoint, workspaceRoot: string | undefined): Promise<string> {
  const before = await readFile(checkpoint.snapshotPath, "utf8");
  const target = join(workspaceRoot ?? checkpoint.workspaceRoot, checkpoint.path);
  const after = await readFile(target, "utf8");
  if (before === after) {
    return `--- ${checkpoint.path}\n+++ ${checkpoint.path}\n(no changes)`;
  }
  return [
    `--- ${checkpoint.path}`,
    `+++ ${checkpoint.path}`,
    ...lineDiff(before, after),
  ].join("\n");
}

function lineDiff(before: string, after: string): readonly string[] {
  const beforeLines = splitLines(before);
  const afterLines = splitLines(after);
  if (beforeLines.length === 1 && afterLines.length === 1) {
    return [`-${beforeLines[0] ?? ""}`, `+${afterLines[0] ?? ""}`];
  }
  return [
    ...beforeLines.map((line) => `-${line}`),
    ...afterLines.map((line) => `+${line}`),
  ];
}

function splitLines(text: string): readonly string[] {
  const normalized = text.endsWith("\n") ? text.slice(0, -1) : text;
  return normalized.length === 0 ? [""] : normalized.split(/\r?\n/u);
}

function oldestCheckpointPerPath(checkpoints: readonly AgentRunCheckpoint[]): readonly AgentRunCheckpoint[] {
  const byPath = new Map<string, AgentRunCheckpoint>();
  for (const checkpoint of checkpoints) {
    const existing = byPath.get(checkpoint.path);
    if (existing === undefined || checkpoint.createdAt < existing.createdAt) {
      byPath.set(checkpoint.path, checkpoint);
    }
  }
  return [...byPath.values()].sort((left, right) => left.path.localeCompare(right.path));
}

function isAgentRunRecord(value: AgentRunRecord | undefined): value is AgentRunRecord {
  return value !== undefined;
}

type ErrnoException = Error & {
  readonly code: string;
};

function isErrnoException(error: unknown): error is ErrnoException {
  return error instanceof Error && "code" in error && typeof error.code === "string";
}
