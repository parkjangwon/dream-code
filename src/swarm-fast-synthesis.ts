import type { SwarmLaneResult } from "./swarm-runner.js";

export type SwarmSynthesisMode = "auto" | "fast" | "llm";

const fastSynthesisLaneThreshold = 8;
const maxLaneSummaryLines = 3;
const maxLaneSummaryChars = 420;

export function shouldUseFastSwarmSynthesis(
  mode: SwarmSynthesisMode,
  laneCount: number,
): boolean {
  if (mode === "fast") {
    return true;
  }
  if (mode === "llm") {
    return false;
  }
  return laneCount >= fastSynthesisLaneThreshold;
}

export function createFastSwarmSynthesis(
  goal: string,
  laneResults: readonly SwarmLaneResult[],
): string {
  const failed = laneResults.filter((result) => result.output.startsWith("Lane failed:"));
  const completed = laneResults.length - failed.length;
  return [
    "Fast synthesis complete.",
    "",
    `Goal: ${goal}`,
    `Lanes: ${completed}/${laneResults.length} completed${failed.length === 0 ? "" : `, ${failed.length} failed`}`,
    "",
    "## Lane Signals",
    "",
    ...laneResults.map(formatLaneSignal),
    "",
    "## Next Actions",
    "",
    ...createNextActions(laneResults),
    "",
    "✓ Done 0ms · local fast merge",
  ].join("\n");
}

function formatLaneSignal(result: SwarmLaneResult): string {
  const status = result.output.startsWith("Lane failed:") ? "failed" : "done";
  const summary = summarizeLaneOutput(result.output);
  return [
    `- ${result.lane.title}`,
    `(${status}, ${(result.elapsedMs / 1000).toFixed(1)}s, ${formatCharacters(result.output.length)})`,
    summary,
  ].join(" ");
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
    "- Review the lane signals above, then act on the highest-confidence overlapping findings first.",
    "- Open the saved swarm artifact when you need the complete per-lane output.",
  ];
}

function summarizeLaneOutput(output: string): string {
  const lines = output
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(isSignalLine)
    .slice(0, maxLaneSummaryLines);
  const summary = lines.length === 0 ? "(no clear signal)" : lines.join(" ");
  return truncate(summary, maxLaneSummaryChars);
}

function isSignalLine(line: string): boolean {
  if (line.length === 0) {
    return false;
  }
  if (/^```/u.test(line)) {
    return false;
  }
  if (/^(✓ Done|● Dream|○ Thinking|╭|╰|│|┌|└)/u.test(line)) {
    return false;
  }
  return true;
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

function formatCharacters(characters: number): string {
  if (characters >= 1000) {
    return `${(characters / 1000).toFixed(1)}k chars`;
  }
  return `${characters} chars`;
}
