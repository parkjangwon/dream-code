import { cwd as currentWorkingDirectory, stdout as output } from "node:process";

import type { DreamConfig } from "./config.js";
import { runAgentSwarm } from "./swarm-runner.js";

export type SwarmQuestioner = {
  readonly question: (prompt: string) => Promise<string>;
};

export type RunSwarmCommandOptions = {
  readonly config: DreamConfig;
  readonly configRoot: string;
  readonly args: string;
  readonly questioner: SwarmQuestioner;
  readonly cwd?: string;
};

type SwarmArgs = {
  readonly goal: string;
  readonly maxAgents?: number;
};

export async function runSwarmCommand(options: RunSwarmCommandOptions): Promise<void> {
  const parsed = parseSwarmArgs(options.args);
  const goal = parsed.goal.length > 0
    ? parsed.goal
    : (await options.questioner.question("Swarm goal: ")).trim();
  if (goal.length === 0) {
    output.write("usage: /swarm [--max agents] <goal>\n");
    return;
  }

  const baseOptions = {
    config: options.config,
    configRoot: options.configRoot,
    cwd: options.cwd ?? currentWorkingDirectory(),
    goal,
    write: (chunk: string) => output.write(chunk),
    replaceMonitor: output.isTTY,
  };
  await runAgentSwarm(parsed.maxAgents === undefined
    ? baseOptions
    : { ...baseOptions, maxAgents: parsed.maxAgents });
}

export function parseSwarmArgs(args: string): SwarmArgs {
  const maxMatch = args.match(/(?:^|\s)--max\s+(\d+)(?=\s|$)/u);
  const maxAgents = parseMaxAgents(maxMatch?.[1]);
  const goal = args.replace(/(?:^|\s)--max\s+\d+(?=\s|$)/u, " ").trim();
  return maxAgents === undefined ? { goal } : { goal, maxAgents };
}

function parseMaxAgents(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return Math.min(100, Math.max(1, parsed));
}
