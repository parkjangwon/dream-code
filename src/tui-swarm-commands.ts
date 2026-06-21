import { cwd as currentWorkingDirectory, stdout as output } from "node:process";

import type { DreamConfig } from "./config.js";
import { ansi, paint } from "./ansi.js";
import { saveSwarmArtifact } from "./swarm-artifacts.js";
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
  readonly forceAgents?: number;
};

export async function runSwarmCommand(options: RunSwarmCommandOptions): Promise<void> {
  const parsed = parseSwarmArgs(options.args);
  const goal = parsed.goal.length > 0
    ? parsed.goal
    : (await options.questioner.question("Swarm goal: ")).trim();
  if (goal.length === 0) {
    output.write("usage: /swarm [--size count] <goal>\n");
    return;
  }

  const replaceMonitor = output.isTTY === true;
  const baseOptions = {
    config: options.config,
    configRoot: options.configRoot,
    cwd: options.cwd ?? currentWorkingDirectory(),
    goal,
    write: (chunk: string) => output.write(chunk),
    replaceMonitor,
    monitorRows: output.rows,
  };
  const summary = await runAgentSwarm(swarmRunOptions(baseOptions, parsed));
  const artifactPath = await saveSwarmArtifact(options.configRoot, summary);
  output.write(`${paint("swarm artifact:", ansi.green)} ${paint(artifactPath, ansi.blue)}\n`);
}

export function parseSwarmArgs(args: string): SwarmArgs {
  const forceMatch = args.match(/(?:^|\s)--size\s+(\d+)(?=\s|$)/u);
  const forceAgents = parseAgentCount(forceMatch?.[1]);
  const goal = args
    .replace(/(?:^|\s)--size\s+\d+(?=\s|$)/u, " ")
    .trim();
  return forceAgents === undefined ? { goal } : { goal, forceAgents };
}

function swarmRunOptions(
  baseOptions: {
    readonly config: DreamConfig;
    readonly configRoot: string;
    readonly cwd: string;
    readonly goal: string;
    readonly write: (chunk: string) => boolean;
    readonly replaceMonitor: boolean;
  },
  parsed: SwarmArgs,
): Parameters<typeof runAgentSwarm>[0] {
  if (parsed.forceAgents !== undefined) {
    return {
      ...baseOptions,
      forceAgents: parsed.forceAgents,
    };
  }
  return baseOptions;
}

function parseAgentCount(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return Math.min(100, Math.max(1, parsed));
}
