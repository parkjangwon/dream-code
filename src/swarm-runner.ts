import { runAgentPrompt } from "./agent-runner.js";
import type { AgentDefinition } from "./agent-library.js";
import { loadAgentDefinitions } from "./agent-definition-loader.js";
import { stripAnsi } from "./ansi.js";
import type { DreamConfig } from "./config.js";
import { createSwarmMonitor } from "./swarm-monitor.js";
import { swarmMonitorWindowOption } from "./swarm-monitor-window.js";
import { formatSwarmCancelled, formatSwarmHeader, formatSwarmSynthesis } from "./swarm-output.js";
import {
  createSwarmPlan,
  createSwarmSynthesisAgent,
  createSwarmSynthesisPrompt,
  type SwarmLane,
} from "./swarm-plan.js";

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
  readonly forceAgents?: number;
  readonly write: (text: string) => void;
  readonly replaceMonitor?: boolean;
  readonly monitorRows?: number;
  readonly signal?: AbortSignal;
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
    ...swarmMonitorWindowOption(options.monitorRows, options.replaceMonitor),
  });
  options.write(formatSwarmHeader(plan.lanes.length, plan.forced));
  monitor.start();

  const laneResults = await Promise.all(plan.lanes.map(async (lane) => {
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
  }));

  if (abortController.signal.aborted) {
    monitor.synthesisCancelled();
    monitor.stop();
    options.write(formatSwarmCancelled());
    return { goal: options.goal, laneResults, synthesis: synthesisCancelledOutput };
  }

  const synthesisAgent = createSwarmSynthesisAgent();
  monitor.synthesisStarted();
  const synthesis = await runSynthesis(runAgent, synthesisAgent, createSwarmSynthesisPrompt(options.goal, laneResults), abortController.signal);
  if (synthesis === synthesisCancelledOutput) {
    monitor.synthesisCancelled();
  } else if (synthesis.startsWith("Synthesis failed:")) {
    monitor.synthesisFailed();
  } else {
    monitor.synthesisDone();
  }
  monitor.stop();
  options.write(formatSwarmSynthesis(synthesis, now() - swarmStartedAt));
  return { goal: options.goal, laneResults, synthesis };
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
  } catch (error) {
    return `Lane failed: ${errorMessage(error)}`;
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
  } catch (error) {
    return `Synthesis failed: ${errorMessage(error)}`;
  }
}

function defaultSwarmAgentRunner(options: SwarmRunOptions): SwarmAgentRunner {
  return async (input) => {
    let transcript = "";
    await runAgentPrompt({
      config: options.config,
      configRoot: options.configRoot,
      prompt: input.prompt,
      agent: input.agent,
      signal: input.signal,
      write: (chunk) => {
        transcript = `${transcript}${stripAnsi(chunk)}`;
        input.report({ characters: transcript.length, preview: tailPreview(transcript) });
      },
    });
    return transcript.trim();
  };
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

function runWithAbort(task: Promise<string>, signal: AbortSignal, cancelledOutput: string): Promise<string> {
  if (signal.aborted) {
    return Promise.resolve(cancelledOutput);
  }
  return new Promise((resolve, reject) => {
    const abort = (): void => {
      resolve(cancelledOutput);
    };
    signal.addEventListener("abort", abort, { once: true });
    task.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", abort);
    });
  });
}

function tailPreview(text: string): string {
  return text.split(/\r?\n/u).slice(-8).join("\n").trim();
}

function swarmPlanOptions(options: SwarmRunOptions): { readonly forceAgents?: number } {
  return options.forceAgents === undefined ? {} : { forceAgents: options.forceAgents };
}

function monitorNowOption(now: (() => number) | undefined): { readonly now?: () => number } {
  return now === undefined ? {} : { now };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown swarm failure";
}
