import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { SwarmRunSummary } from "./swarm-runner.js";

export async function saveSwarmArtifact(root: string, summary: SwarmRunSummary): Promise<string> {
  const directory = join(root, "artifacts");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const filePath = join(directory, `swarm-${safeStamp(new Date())}.md`);
  await writeFile(filePath, formatSwarmArtifact(summary), "utf8");
  return filePath;
}

export function formatSwarmArtifact(summary: SwarmRunSummary): string {
  return [
    "# Dream Swarm Report",
    "",
    `Goal: ${summary.goal}`,
    "",
    "## Lanes",
    "",
    ...summary.laneResults.map((result) => [
      `### ${result.lane.id}. ${result.lane.agent.name}`,
      "",
      `Elapsed: ${(result.elapsedMs / 1000).toFixed(1)}s`,
      "",
      result.output.trim(),
      "",
    ].join("\n")),
    "## Synthesis",
    "",
    summary.synthesis.trim(),
    "",
  ].join("\n");
}

function safeStamp(date: Date): string {
  return date.toISOString().replace(/[:.]/gu, "-");
}
