import type { SwarmLaneResult } from "./swarm-runner.js";

export type SwarmSynthesisMode = "auto" | "fast" | "llm";

export function shouldUseFastSwarmSynthesis(
  mode: SwarmSynthesisMode,
  _laneCount: number,
): boolean {
  if (mode === "fast") {
    return true;
  }
  if (mode === "llm") {
    return false;
  }
  return false;
}

export function createFastSwarmSynthesis(
  goal: string,
  laneResults: readonly SwarmLaneResult[],
): string {
  const failed = laneResults.filter((result) => result.output.startsWith("Lane failed:"));
  const completed = laneResults.length - failed.length;
  return [
    "Swarm synthesis fallback complete.",
    "",
    `Goal: ${goal}`,
    `Lanes: ${completed}/${laneResults.length} completed${failed.length === 0 ? "" : `, ${failed.length} failed`}`,
    "",
    "## Next Actions",
    "",
    ...createNextActions(laneResults),
    "",
    "✓ Done 0ms · fallback merge",
  ].join("\n");
}

function createNextActions(laneResults: readonly SwarmLaneResult[]): readonly string[] {
  const failures = laneResults.filter((result) => result.output.startsWith("Lane failed:"));
  if (failures.length > 0) {
    return [
      `- Re-run or inspect ${failures.length} failed swarm lane${failures.length === 1 ? "" : "s"} before acting on risky changes.`,
      "- Use the lane artifact for full details when a finding needs exact context.",
    ];
  }
  return [
    "- Use the saved swarm artifact for complete per-lane output.",
    "- Run a normal synthesis pass when you need a polished final answer.",
  ];
}
