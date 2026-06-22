import type { AgentDefinition } from "./agent-library.js";
import { adaptiveLaneLimit, type SwarmIntensity } from "./swarm-intensity.js";
import { plannedLaneBlueprints, type LaneBlueprint } from "./swarm-lane-blueprints.js";

export type SwarmLane = {
  readonly id: string;
  readonly title: string;
  readonly agent: AgentDefinition;
  readonly prompt: string;
};

export type SwarmPlan = {
  readonly goal: string;
  readonly lanes: readonly SwarmLane[];
  readonly maxConcurrency: number;
  readonly forced: boolean;
  readonly intensity: SwarmIntensity;
};

export type SwarmPlanOptions = {
  readonly adaptiveLimit?: number;
  readonly forceLanes?: number;
  readonly forceAgents?: number;
  readonly intensity?: SwarmIntensity;
  readonly maxConcurrency?: number;
};

const forcedConcurrencyCap = 16;

const preferredAgentOrder = [
  "tech-lead",
  "code-reviewer",
  "security-reviewer",
  "code-simplifier",
  "ux-reviewer",
] as const;

export function createSwarmPlan(
  goal: string,
  agents: readonly AgentDefinition[],
  options: number | SwarmPlanOptions = 8,
): SwarmPlan {
  const planOptions = normalizePlanOptions(options);
  const lanes = createSwarmLanes(goal, agents, planOptions);
  const maxConcurrency = maxRuntimeConcurrency(lanes.length, planOptions);
  return {
    goal,
    lanes,
    maxConcurrency,
    forced: planOptions.forceLanes !== undefined,
    intensity: planOptions.intensity,
  };
}

export function createSwarmSynthesisAgent(): AgentDefinition {
  return {
    id: "swarm-synthesizer",
    name: "Swarm Synthesizer",
    summary: "Merge parallel subagent outputs into one decisive answer.",
    model: "high",
    tools: ["read"],
    prompt: [
      "You merge Dream Code Agent Swarm outputs.",
      "Preserve concrete findings, remove duplicates, resolve conflicts, and return the shortest decisive next action list.",
      "Return a user-facing final answer, not raw lane logs.",
    ].join(" "),
    source: "built-in",
  };
}

export function createSwarmSynthesisPrompt(
  goal: string,
  laneResults: readonly { readonly lane: SwarmLane; readonly output: string }[],
): string {
  return [
    "Merge these parallel Dream Code swarm results into one final answer.",
    "Do not include Lane Signals, raw tool traces, or per-lane transcript dumps.",
    "Write the final answer the user can act on immediately.",
    `Original goal: ${goal}`,
    "",
    ...laneResults.map((result) => [
      `## ${result.lane.title}`,
      compactLaneOutput(result.output),
      "",
    ].join("\n")),
  ].join("\n");
}

function createSwarmLanes(
  goal: string,
  agents: readonly AgentDefinition[],
  options: NormalizedSwarmPlanOptions,
): readonly SwarmLane[] {
  const ordered = orderedSwarmAgents(agents);
  if (ordered.length === 0) {
    return [];
  }
  const blueprints = plannedLaneBlueprints(goal, options.adaptiveLimit, options.forceLanes, options.intensity);
  return blueprints.map((blueprint, index) => laneFromBlueprint(goal, ordered, blueprint, index + 1));
}

function laneFromBlueprint(
  goal: string,
  agents: readonly AgentDefinition[],
  blueprint: LaneBlueprint,
  laneNumber: number,
): SwarmLane {
  const agent = agentForBlueprint(agents, blueprint);
  return {
    id: `lane-${String(laneNumber).padStart(2, "0")}-${slug(blueprint.key)}`,
    title: blueprint.title,
    agent,
    prompt: lanePrompt(goal, agent, blueprint, laneNumber),
  };
}

function agentForBlueprint(agents: readonly AgentDefinition[], blueprint: LaneBlueprint): AgentDefinition {
  return agents.find((agent) => agent.id === blueprint.agentId)
    ?? agents.find((agent) => agent.id === "code-reviewer")
    ?? agents[0]
    ?? missingAgent();
}

function missingAgent(): never {
  throw new Error("Cannot create swarm lanes without agents");
}

function orderedSwarmAgents(agents: readonly AgentDefinition[]): readonly AgentDefinition[] {
  const byId = new Map(agents.map((agent) => [agent.id, agent]));
  const preferred = preferredAgentOrder
    .map((id) => byId.get(id))
    .filter(isAgentDefinition);
  const remaining = agents.filter((agent) => !preferred.some((selected) => selected.id === agent.id));
  return [...preferred, ...remaining];
}

function lanePrompt(goal: string, agent: AgentDefinition, blueprint: LaneBlueprint, laneNumber: number): string {
  return [
    `You are parallel swarm lane ${laneNumber}: ${blueprint.title}.`,
    `Base agent profile: ${agent.name}.`,
    "Work independently. Do not wait for other lanes. Spend tokens aggressively when it improves coverage.",
    `Original goal: ${goal}`,
    `Your lane mission: ${blueprint.mission}`,
    `Base agent mission: ${agent.summary}`,
    "Return a compact artifact with: Summary, Findings, Proposed actions, Risks.",
  ].join("\n");
}

type NormalizedSwarmPlanOptions = Required<Pick<SwarmPlanOptions, "adaptiveLimit" | "intensity">> & Pick<SwarmPlanOptions, "forceLanes" | "maxConcurrency">;

function normalizePlanOptions(options: number | SwarmPlanOptions): NormalizedSwarmPlanOptions {
  if (typeof options === "number") {
    return { adaptiveLimit: options, intensity: "standard" };
  }
  const forceLanes = options.forceLanes ?? options.forceAgents;
  return forceLanes === undefined
    ? {
      adaptiveLimit: options.adaptiveLimit ?? adaptiveLaneLimit(options.intensity ?? "standard"),
      intensity: options.intensity ?? "standard",
      ...(options.maxConcurrency === undefined ? {} : { maxConcurrency: options.maxConcurrency }),
    }
    : {
      adaptiveLimit: options.adaptiveLimit ?? forceLanes,
      forceLanes,
      intensity: options.intensity ?? "standard",
      ...(options.maxConcurrency === undefined ? {} : { maxConcurrency: options.maxConcurrency }),
    };
}

function maxRuntimeConcurrency(
  laneCount: number,
  options: Pick<SwarmPlanOptions, "forceLanes" | "maxConcurrency">,
): number {
  if (laneCount === 0) {
    return 1;
  }
  if (options.maxConcurrency !== undefined) {
    return clampConcurrency(options.maxConcurrency, laneCount);
  }
  if (options.forceLanes !== undefined) {
    return clampConcurrency(forcedConcurrencyCap, laneCount);
  }
  return clampConcurrency(laneCount, laneCount);
}

function compactLaneOutput(output: string): string {
  const trimmed = output.trim();
  if (trimmed.length === 0) {
    return "(no output)";
  }
  const maxChars = 2_800;
  if (trimmed.length <= maxChars) {
    return trimmed;
  }
  const headChars = 1_300;
  const tailChars = 1_100;
  return [
    trimmed.slice(0, headChars).trimEnd(),
    "",
    `[truncated ${trimmed.length - headChars - tailChars} chars before synthesis]`,
    "",
    trimmed.slice(-tailChars).trimStart(),
  ].join("\n");
}

function clampConcurrency(value: number, laneCount: number): number {
  return Math.max(1, Math.min(Math.floor(value), laneCount));
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/gu, "-").replace(/^-|-$/gu, "") || "lane";
}

function isAgentDefinition(value: AgentDefinition | undefined): value is AgentDefinition {
  return value !== undefined;
}
