import type { AgentDefinition } from "./agent-library.js";
import { registerActor, updateActorStatus } from "./actor-store.js";
import { appendTaskProgress, writeCheckpoint } from "./memory-store.js";

export type MemoryLane = {
  readonly id: string;
  readonly title: string;
  readonly agent: AgentDefinition;
  readonly prompt: string;
};

export type MemoryLaneResult = {
  readonly lane: MemoryLane;
  readonly output: string;
  readonly elapsedMs: number;
};

export type SwarmMemorySummary = {
  readonly goal: string;
  readonly laneResults: readonly MemoryLaneResult[];
  readonly synthesis: string;
};

export type SwarmMemoryWriteResult = {
  readonly checkpointPath: string;
  readonly taskProgressPaths: readonly string[];
};

export async function writeSwarmMemory(
  root: string,
  directory: string,
  sessionId: string,
  summary: SwarmMemorySummary,
): Promise<SwarmMemoryWriteResult> {
  const actor = await registerActor(root, {
    id: memoryWriterActorId(sessionId),
    role: "system",
    name: "memory-writer",
    task: `Absorb swarm result: ${summary.goal}`,
    sessionId,
    taskId: swarmTaskId(summary.goal),
  });
  try {
    const checkpointPath = await writeCheckpoint(root, directory, sessionId, {
      title: "Swarm checkpoint",
      body: renderSwarmCheckpoint(summary),
    });
    const taskProgressPaths = await writeLaneProgress(root, directory, summary);
    await updateActorStatus(root, actor.id, "done", { summary: "Swarm result absorbed into memory." });
    return { checkpointPath, taskProgressPaths };
  } catch (error) {
    await updateActorStatus(root, actor.id, "failed", { error: errorMessage(error) });
    throw error;
  }
}

function renderSwarmCheckpoint(summary: SwarmMemorySummary): string {
  return [
    `Goal: ${summary.goal}`,
    "",
    "## Synthesis",
    truncate(summary.synthesis),
    "",
    "## Lane Results",
    ...summary.laneResults.map(renderLaneCheckpoint),
  ].join("\n");
}

async function writeLaneProgress(
  root: string,
  directory: string,
  summary: SwarmMemorySummary,
): Promise<readonly string[]> {
  const taskId = swarmTaskId(summary.goal);
  const paths: string[] = [];
  for (const result of summary.laneResults) {
    const path = await appendTaskProgress(root, directory, taskId, renderLaneProgress(result));
    if (!paths.includes(path)) {
      paths.push(path);
    }
  }
  return paths;
}

function renderLaneCheckpoint(result: MemoryLaneResult): string {
  return [
    `### ${result.lane.title}`,
    `Agent: ${result.lane.agent.id}`,
    `Elapsed: ${(result.elapsedMs / 1000).toFixed(1)}s`,
    `Prompt: ${singleLine(result.lane.prompt)}`,
    "",
    "Output:",
    truncate(result.output),
  ].join("\n");
}

function renderLaneProgress(result: MemoryLaneResult): string {
  return [
    `Lane: ${result.lane.title}`,
    `Agent: ${result.lane.agent.id}`,
    `Elapsed: ${(result.elapsedMs / 1000).toFixed(1)}s`,
    `Signal: ${progressSignal(result.output)}`,
    "",
    truncate(result.output),
  ].join("\n");
}

function memoryWriterActorId(sessionId: string): string {
  return `memory-writer_${slug(sessionId)}`;
}

function swarmTaskId(goal: string): string {
  return `swarm-${slug(goal).slice(0, 48) || "task"}`;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/gu, "-").replace(/^-|-$/gu, "");
}

function truncate(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > 2_400 ? `${trimmed.slice(0, 2_400)}\n[Truncated]` : trimmed;
}

function singleLine(value: string): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  return normalized.length > 160 ? `${normalized.slice(0, 157)}...` : normalized;
}

function progressSignal(output: string): string {
  if (/failed|error|missing|risk|vulnerab|secret/iu.test(output)) {
    return "needs-review";
  }
  if (/cancelled|stopped/iu.test(output)) {
    return "cancelled";
  }
  return "usable";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown memory writer failure";
}
