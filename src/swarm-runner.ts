import type { AgentDefinition } from "./agent-library.js";
import { loadAgentDefinitions } from "./agent-definition-loader.js";
import { runWithAbort } from "./abortable-run.js";
import { ansi, paint } from "./ansi.js";
import type { DreamConfig } from "./config.js";
import { writeSwarmMemory } from "./memory-writer.js";
import { defaultSwarmAgentRunner } from "./swarm-agent-runner.js";
import { createSwarmMonitor } from "./swarm-monitor.js";
import { swarmMonitorWindowOption } from "./swarm-monitor-window.js";
import { formatSwarmCancelled, formatSwarmHeader, formatSwarmSynthesis } from "./swarm-output.js";
import { monitorColumnsOption, monitorNowOption } from "./swarm-runner-options.js";
import {
  createFastSwarmSynthesis,
  shouldUseFastSwarmSynthesis,
  type SwarmSynthesisMode,
} from "./swarm-fast-synthesis.js";
import { runWithConcurrency } from "./swarm-scheduler.js";
import {
  createSwarmPlan,
  createSwarmSynthesisAgent,
  createSwarmSynthesisPrompt,
  type SwarmLane,
} from "./swarm-plan.js";
import type { SwarmIntensity } from "./swarm-intensity.js";

export type SwarmRunProgress = {
  readonly characters: number;
  readonly preview?: string;
};

export type SwarmRunInput =
  | {
    readonly kind: "lane";
    readonly lane: SwarmLane;
    readonly agent: AgentDefinition;
    readonly prompt: string;
    readonly signal: AbortSignal;
    readonly report: (progress: SwarmRunProgress) => void;
  }
  | {
    readonly kind: "synthesis";
    readonly agent: AgentDefinition;
    readonly prompt: string;
    readonly signal: AbortSignal;
    readonly report: (progress: SwarmRunProgress) => void;
  };

export type SwarmAgentRunner = (input: SwarmRunInput) => Promise<string>;

export type SwarmLaneResult = {
  readonly lane: SwarmLane;
  readonly output: string;
  readonly elapsedMs: number;
};

export type SwarmRunSummary = {
  readonly goal: string;
  readonly laneResults: readonly SwarmLaneResult[];
  readonly synthesis: string;
};

export type SwarmRunOptions = {
  readonly config: DreamConfig;
  readonly configRoot: string;
  readonly cwd: string;
  readonly goal: string;
  readonly forceLanes?: number;
  readonly forceAgents?: number;
  readonly intensity?: SwarmIntensity;
  readonly write: (text: string) => void;
  readonly replaceMonitor?: boolean;
  readonly monitorRows?: number;
  readonly monitorColumns?: number;
  readonly signal?: AbortSignal;
  readonly sessionId?: string;
  readonly synthesisMode?: SwarmSynthesisMode;
  readonly now?: () => number;
  readonly runAgent?: SwarmAgentRunner;
};

const laneCancelledOutput = "Lane cancelled: swarm stopped by user.";
const synthesisCancelledOutput = "Synthesis cancelled: swarm stopped by user.";

export async function runAgentSwarm(options: SwarmRunOptions): Promise<SwarmRunSummary> {
  const agents = await loadAgentDefinitions(options.configRoot, options.cwd);
  return runAgentSwarmWithAgents({ ...options, agents });
}

export async function runAgentSwarmWithAgents(
  options: SwarmRunOptions & { readonly agents: readonly AgentDefinition[] },
): Promise<SwarmRunSummary> {
  const now = options.now ?? Date.now;
  const swarmStartedAt = now();
  const plan = createSwarmPlan(options.goal, options.agents, swarmPlanOptions(options));
  const runAgent = options.runAgent ?? defaultSwarmAgentRunner(options);
  const abortController = createSwarmAbortController(options.signal);
  const monitor = createSwarmMonitor(options.replaceMonitor === undefined ? {
    goal: options.goal,
    lanes: plan.lanes,
    write: options.write,
    onAbort: () => {
      abortController.abort();
    },
    ...monitorNowOption(options.now),
    ...monitorColumnsOption(options.monitorColumns),
    ...swarmMonitorWindowOption(options.monitorRows, options.replaceMonitor),
  } : {
    goal: options.goal,
    lanes: plan.lanes,
    write: options.write,
    replaceInPlace: options.replaceMonitor,
    interactive: options.replaceMonitor === true,
    onAbort: () => {
      abortController.abort();
    },
    ...monitorNowOption(options.now),
    ...monitorColumnsOption(options.monitorColumns),
    ...swarmMonitorWindowOption(options.monitorRows, options.replaceMonitor),
  });
  options.write(formatSwarmHeader(plan.lanes.length, plan.forced, plan.intensity));
  monitor.start();

  const laneResults = await runWithConcurrency(plan.lanes, plan.maxConcurrency, async (lane) => {
    const startedAt = now();
    monitor.laneStarted(lane.id);
    const output = await runLane(runAgent, lane, (progress) => {
      monitor.laneProgress(lane.id, progress.characters, progress.preview);
    }, abortController.signal);
    const elapsedMs = now() - startedAt;
    if (output === laneCancelledOutput) {
      monitor.laneCancelled(lane.id, output.length, output);
    } else if (output.startsWith("Lane failed:")) {
      monitor.laneFailed(lane.id, output.length, output);
    } else {
      monitor.laneDone(lane.id, output.length, output);
    }
    return { lane, output, elapsedMs };
  });

  if (abortController.signal.aborted) {
    monitor.synthesisCancelled();
    monitor.stop();
    options.write(formatSwarmCancelled());
    const summary = { goal: options.goal, laneResults, synthesis: synthesisCancelledOutput };
    await absorbSwarmMemory(options, summary);
    return summary;
  }

  monitor.synthesisStarted();
  const synthesis = shouldUseFastSwarmSynthesis(options.synthesisMode ?? "auto", laneResults.length)
    ? createFastSwarmSynthesis(options.goal, laneResults)
    : await runSynthesis(
      runAgent,
      createSwarmSynthesisAgent(),
      createSwarmSynthesisPrompt(options.goal, laneResults),
      abortController.signal,
    );
  if (synthesis === synthesisCancelledOutput) {
    monitor.synthesisCancelled();
  } else if (synthesis.startsWith("Synthesis failed:")) {
    monitor.synthesisFailed();
  } else {
    monitor.synthesisDone();
  }
  monitor.stop();
  options.write(formatSwarmSynthesis(synthesis, now() - swarmStartedAt, laneOutputCharacters(laneResults)));
  const summary = { goal: options.goal, laneResults, synthesis };
  await absorbSwarmMemory(options, summary);
  return summary;
}

async function runLane(
  runAgent: SwarmAgentRunner,
  lane: SwarmLane,
  report: (progress: SwarmRunProgress) => void,
  signal: AbortSignal,
): Promise<string> {
  try {
    return await runWithAbort(runAgent({
      kind: "lane",
      lane,
      agent: lane.agent,
      prompt: lane.prompt,
      signal,
      report,
    }), signal, laneCancelledOutput);
  } catch (error: unknown) {
    if (error instanceof Error) {
      return `Lane failed: ${error.message}`;
    }
    return "Lane failed: Unknown swarm failure";
  }
}

async function runSynthesis(
  runAgent: SwarmAgentRunner,
  agent: AgentDefinition,
  prompt: string,
  signal: AbortSignal,
): Promise<string> {
  try {
    return await runWithAbort(runAgent({
      kind: "synthesis",
      agent,
      prompt,
      signal,
      report: () => undefined,
    }), signal, synthesisCancelledOutput);
  } catch (error: unknown) {
    if (error instanceof Error) {
      return `Synthesis failed: ${error.message}`;
    }
    return "Synthesis failed: Unknown swarm failure";
  }
}

async function absorbSwarmMemory(options: SwarmRunOptions, summary: SwarmRunSummary): Promise<void> {
  if (options.sessionId === undefined) {
    return;
  }
  try {
    await writeSwarmMemory(options.configRoot, options.cwd, options.sessionId, summary);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown swarm failure";
    options.write(`${paint("swarm memory skipped:", ansi.yellow)} ${message}\n`);
  }
}

function laneOutputCharacters(laneResults: readonly SwarmLaneResult[]): number {
  return laneResults.reduce((total, result) => total + result.output.length, 0);
}

function createSwarmAbortController(externalSignal: AbortSignal | undefined): AbortController {
  const controller = new AbortController();
  const abort = (): void => {
    controller.abort();
  };
  if (externalSignal?.aborted === true) {
    abort();
    return controller;
  }
  externalSignal?.addEventListener("abort", abort, { once: true });
  return controller;
}

function swarmPlanOptions(options: SwarmRunOptions): { readonly forceLanes?: number; readonly forceAgents?: number; readonly intensity?: SwarmIntensity } {
  return {
    ...(options.forceLanes === undefined ? {} : { forceLanes: options.forceLanes }),
    ...(options.forceAgents === undefined ? {} : { forceAgents: options.forceAgents }),
    ...(options.intensity === undefined ? {} : { intensity: options.intensity }),
  };
}
