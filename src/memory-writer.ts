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
    ...summary.laneResults.map((result) => [
      `### ${result.lane.title}`,
      `Elapsed: ${(result.elapsedMs / 1000).toFixed(1)}s`,
      truncate(result.output),
    ].join("\n")),
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
    const path = await appendTaskProgress(root, directory, taskId, [
      `${result.lane.title} (${(result.elapsedMs / 1000).toFixed(1)}s)`,
      "",
      truncate(result.output),
    ].join("\n"));
    if (!paths.includes(path)) {
      paths.push(path);
    }
  }
  return paths;
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown memory writer failure";
}
