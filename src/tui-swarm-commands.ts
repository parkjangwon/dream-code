import { cwd as currentWorkingDirectory, stdout as output } from "node:process";

import type { DreamConfig } from "./config.js";
import { ansi, paint } from "./ansi.js";
import { notifySwarmComplete } from "./notifications.js";
import { parseSwarmArgs, type SwarmArgs } from "./swarm-args.js";
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
  readonly sessionId?: string;
};

export async function runSwarmCommand(options: RunSwarmCommandOptions): Promise<void> {
  const parsed = parseSwarmArgs(options.args);
  const goal = parsed.goal.length > 0
    ? parsed.goal
    : (await options.questioner.question("Swarm goal: ")).trim();
  if (goal.length === 0) {
    output.write("usage: /swarm [--light|--standard|--deep|--max|--overdrive] [--lanes count] <goal>\n");
    return;
  }
  if (parsed.deprecatedSize !== undefined) {
    output.write(`${paint("--size is deprecated.", ansi.yellow)} Use ${paint("--deep/--max", ansi.blue)} for adaptive planning or ${paint(`--lanes ${parsed.deprecatedSize}`, ansi.blue)} to force an exact lane count.\n`);
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
    ...(options.sessionId === undefined ? {} : { sessionId: options.sessionId }),
  };
  const summary = await runAgentSwarm(swarmRunOptions(baseOptions, parsed));
  const artifactPath = await saveSwarmArtifact(options.configRoot, summary);
  output.write(`${paint("swarm artifact:", ansi.green)} ${paint(artifactPath, ansi.blue)}\n`);
  await notifySwarmComplete(options.config, goal, summary.laneResults.length);
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
  if (parsed.forceLanes !== undefined || parsed.intensity !== undefined) {
    return {
      ...baseOptions,
      ...(parsed.forceLanes === undefined ? {} : { forceLanes: parsed.forceLanes }),
      ...(parsed.intensity === undefined ? {} : { intensity: parsed.intensity }),
    };
  }
  return baseOptions;
}

export { parseSwarmArgs } from "./swarm-args.js";
