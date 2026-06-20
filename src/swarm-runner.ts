import { runAgentPrompt } from "./agent-runner.js";
import type { AgentDefinition } from "./agent-library.js";
import { loadAgentDefinitions } from "./agent-definition-loader.js";
import { ansi, paint, stripAnsi } from "./ansi.js";
import type { DreamConfig } from "./config.js";
import {
  createSwarmPlan,
  createSwarmSynthesisAgent,
  createSwarmSynthesisPrompt,
  type SwarmLane,
} from "./swarm-plan.js";

export type SwarmRunInput =
  | { readonly kind: "lane"; readonly lane: SwarmLane; readonly agent: AgentDefinition; readonly prompt: string }
  | { readonly kind: "synthesis"; readonly agent: AgentDefinition; readonly prompt: string };

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
  readonly maxAgents?: number;
  readonly write: (text: string) => void;
  readonly runAgent?: SwarmAgentRunner;
};

export async function runAgentSwarm(options: SwarmRunOptions): Promise<SwarmRunSummary> {
  const agents = await loadAgentDefinitions(options.configRoot, options.cwd);
  return runAgentSwarmWithAgents({ ...options, agents });
}

export async function runAgentSwarmWithAgents(
  options: SwarmRunOptions & { readonly agents: readonly AgentDefinition[] },
): Promise<SwarmRunSummary> {
  const plan = createSwarmPlan(options.goal, options.agents, options.maxAgents);
  const runAgent = options.runAgent ?? defaultSwarmAgentRunner(options);
  options.write(formatSwarmHeader(plan.lanes.length));

  const laneResults = await Promise.all(plan.lanes.map(async (lane) => {
    const startedAt = Date.now();
    options.write(`${paint("↯", ansi.accent)} ${paint("launch", ansi.dim)} ${lane.title}\n`);
    const output = await runAgent({
      kind: "lane",
      lane,
      agent: lane.agent,
      prompt: lane.prompt,
    });
    const elapsedMs = Date.now() - startedAt;
    options.write(`${paint("✓", ansi.green)} ${paint("done", ansi.dim)} ${lane.title} ${paint(`${elapsedMs}ms`, ansi.guide)}\n`);
    return { lane, output, elapsedMs };
  }));

  const synthesisAgent = createSwarmSynthesisAgent();
  const synthesis = await runAgent({
    kind: "synthesis",
    agent: synthesisAgent,
    prompt: createSwarmSynthesisPrompt(options.goal, laneResults),
  });
  options.write(formatSwarmSynthesis(synthesis));
  return { goal: options.goal, laneResults, synthesis };
}

function defaultSwarmAgentRunner(options: SwarmRunOptions): SwarmAgentRunner {
  return async (input) => {
    let transcript = "";
    await runAgentPrompt({
      config: options.config,
      configRoot: options.configRoot,
      prompt: input.prompt,
      agent: input.agent,
      write: (chunk) => {
        transcript = `${transcript}${stripAnsi(chunk)}`;
      },
    });
    return transcript.trim();
  };
}

function formatSwarmHeader(agentCount: number): string {
  return [
    `${paint("✹ Dream Swarm", ansi.accent)} ${paint(`${agentCount} parallel agents`, ansi.bold)}`,
    paint("Kimi-style fan-out · token mixing on · synthesis pass enabled", ansi.guide),
  ].join("\n").concat("\n");
}

function formatSwarmSynthesis(synthesis: string): string {
  const body = synthesis.trim().length === 0 ? "No synthesis output." : synthesis.trim();
  return [
    `${paint("●", ansi.green)} ${paint("Swarm Synthesis", ansi.bold)}`,
    ...body.split(/\r?\n/u).map((line) => `${paint("│", ansi.guide)} ${line}`),
    `${paint("✓", ansi.green)} ${paint("Swarm complete", ansi.dim)}`,
  ].join("\n").concat("\n");
}
