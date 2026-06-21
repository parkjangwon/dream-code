import type { AgentRunKind } from "./agent-run-record.js";

type ToolCycleRun = {
  readonly runKind?: AgentRunKind;
  readonly prompt: string;
};

const toolCycleBudgets = {
  agent: 24,
  goalAgent: 40,
  swarmLane: 12,
  swarmSynthesis: 8,
} as const;

export function maxToolCyclesForRun(run: ToolCycleRun): number {
  if (run.runKind === "swarm-lane") {
    return toolCycleBudgets.swarmLane;
  }
  if (run.runKind === "swarm-synthesis") {
    return toolCycleBudgets.swarmSynthesis;
  }
  return looksLikeGoalRun(run.prompt) ? toolCycleBudgets.goalAgent : toolCycleBudgets.agent;
}

function looksLikeGoalRun(prompt: string): boolean {
  return /\b(active goal|goal mode|continue the active dream code goal|drive this goal)\b/iu.test(prompt);
}
