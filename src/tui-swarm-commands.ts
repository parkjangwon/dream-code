import { cwd as currentWorkingDirectory, stdout as output } from "node:process";

import type { DreamConfig } from "./config.js";
import { ansi, paint } from "./ansi.js";
import { notifySwarmComplete } from "./notifications.js";
import { parseSwarmArgs, type SwarmArgs } from "./swarm-args.js";
import { saveSwarmArtifact } from "./swarm-artifacts.js";
import { runAgentSwarm } from "./swarm-runner.js";
import { createLayeredMainWriter, layeredTerminalLayout, renderLayeredScreen } from "./tui-layered-screen.js";
import { buildBottomStatusLines } from "./tui-status-bar.js";
import type { ResizeSubscriber } from "./tui-fullscreen.js";

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
  readonly oneShotYolo?: boolean;
  readonly resize?: ResizeSubscriber;
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
  const cwd = options.cwd ?? currentWorkingDirectory();
  const layeredLayout = replaceMonitor && options.sessionId !== undefined
    ? renderLayeredScreen({
      config: options.config,
      oneShotYolo: options.oneShotYolo === true,
      statusLines: await buildBottomStatusLines({
        config: options.config,
        configRoot: options.configRoot,
        sessionId: options.sessionId,
        cwd,
        oneShotYolo: options.oneShotYolo === true,
      }),
      busyLabel: "running",
      guideLine: "monitor keys active · esc esc stop",
      terminalRows: output.rows,
      terminalColumns: output.columns,
    })
    : undefined;
  const layeredWriter = layeredLayout === undefined
    ? undefined
    : createLayeredMainWriter(layeredLayout, {
      terminalRows: () => output.rows,
      terminalColumns: () => output.columns,
    });
  const baseOptions = {
    config: options.config,
    configRoot: options.configRoot,
    cwd,
    goal,
    write: (chunk: string) => layeredWriter?.write(chunk) ?? output.write(chunk),
    replaceMonitor,
    monitorRows: output.rows,
    ...(output.columns === undefined ? {} : { monitorColumns: output.columns }),
    ...(layeredLayout === undefined ? {} : {
      monitorAnchorRow: layeredLayout.mainStartRow + 2,
      monitorViewportRows: layeredLayout.mainRows,
      monitorColumnsProvider: () => output.columns,
      monitorAnchorRowProvider: () => layeredTerminalLayout(output.rows).mainStartRow + 2,
      monitorViewportRowsProvider: () => layeredTerminalLayout(output.rows).mainRows,
    }),
    ...(options.resize === undefined ? {} : { resize: options.resize }),
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
    readonly monitorColumns?: number;
    readonly monitorColumnsProvider?: () => number | undefined;
    readonly monitorAnchorRow?: number;
    readonly monitorAnchorRowProvider?: () => number | undefined;
    readonly monitorViewportRows?: number;
    readonly monitorViewportRowsProvider?: () => number | undefined;
    readonly resize?: ResizeSubscriber;
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
